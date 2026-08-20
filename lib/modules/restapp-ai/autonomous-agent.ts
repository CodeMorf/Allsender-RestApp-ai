import 'server-only';

import {
  buildRestappLlmTools,
  getRestappAgentTool,
  selectRestappAgentTools,
  type RestappConversationPhase,
} from './agent-tools';
import {
  executeRestappAgentTool,
  type RestappAgentExecutionContext,
} from './agent-executor';

export type RestappLlmToolCall = {
  id?: string;
  name: string;
  arguments?: Record<string, unknown> | string | null;
};

export type RestappLlmStep = {
  text?: string | null;
  toolCalls?: RestappLlmToolCall[];
  raw?: unknown;
};

export type RestappAgentTraceItem = {
  toolCall: RestappLlmToolCall;
  toolId: string | null;
  result: unknown;
};

/**
 * Provider-neutral contract. The host AllSender runtime connects this to the
 * already configured team AI / CodeMorf provider. RestaPP never stores a
 * second provider or calls a second model by itself.
 */
export type RestappLlmAdapter = {
  complete(input: {
    teamId: number;
    message: string;
    phase: RestappConversationPhase;
    tools: ReturnType<typeof buildRestappLlmTools>;
    trace: RestappAgentTraceItem[];
    state: Record<string, unknown>;
    system: string;
  }): Promise<RestappLlmStep>;
};

export type RestappAutonomousTurnInput = {
  teamId: number;
  message: string;
  phase?: RestappConversationPhase;
  llm: RestappLlmAdapter;
  execution?: RestappAgentExecutionContext;
  maxSteps?: number;
  maxTools?: number;
};

function parseArgs(input: RestappLlmToolCall['arguments']): Record<string, unknown> {
  if (!input) return {};
  if (typeof input === 'object') return input;
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function systemPrompt(phase: RestappConversationPhase) {
  return [
    'Eres el agente autónomo de RestaPP AI dentro de AllSender.',
    'RestaPP usa el motor IA, entrenamiento/RAG, canales y automatizaciones del equipo; no inventes proveedores paralelos.',
    'Usa herramientas para consultar o ejecutar acciones reales. Nunca afirmes que ejecutaste una acción si no hay resultado ok.',
    'No inventes precios, stock, horarios, disponibilidad, estados de pedidos, reservas, promociones ni datos del cliente.',
    'Cuando necesites conocimiento entrenado del restaurante usa restapp__faq__search o una herramienta FAQ especializada; esa ruta consume el RAG del equipo mediante adapter.',
    'Las herramientas write marcadas con confirmación solo pueden ejecutarse después de confirmación explícita del cliente. El ejecutor también lo valida.',
    'Puedes encadenar varias herramientas durante el mismo turno. Las lecturas independientes pueden resolverse en paralelo; las escrituras se ejecutan secuencialmente.',
    'No solicites todos los datos de una vez: pregunta únicamente por el dato indispensable que falte.',
    'Si una herramienta responde runtime_adapter_required, no inventes el resultado: usa otra herramienta válida o explica que esa integración debe resolverla el runtime.',
    `Fase conversacional actual: ${phase}.`,
  ].join('\n');
}

async function executeBatch(
  teamId: number,
  calls: RestappLlmToolCall[],
  ctx: RestappAgentExecutionContext,
): Promise<RestappAgentTraceItem[]> {
  const enriched = calls.slice(0, 6).map((call) => ({ call, def: getRestappAgentTool(call.name) }));
  const reads = enriched.filter((x) => x.def?.kind !== 'write').slice(0, 3);
  const writes = enriched.filter((x) => x.def?.kind === 'write');
  const output: RestappAgentTraceItem[] = [];

  if (reads.length) {
    const readResults = await Promise.all(
      reads.map(async ({ call, def }) => ({
        toolCall: call,
        toolId: def?.id || null,
        result: await executeRestappAgentTool(teamId, call.name, parseArgs(call.arguments), ctx),
      })),
    );
    output.push(...readResults);
  }

  // Mutations are deliberately serialized to preserve ordering and avoid
  // duplicate side effects during autonomous multi-tool turns.
  for (const { call, def } of writes) {
    output.push({
      toolCall: call,
      toolId: def?.id || null,
      result: await executeRestappAgentTool(teamId, call.name, parseArgs(call.arguments), ctx),
    });
  }

  return output;
}

/**
 * Autonomous per-message agent loop.
 * No cron/time polling: every loop starts from an inbound conversation turn.
 * The LLM chooses tools, receives their real results, and may call additional
 * tools until it has a final answer or reaches the safety step limit.
 */
export async function runRestappAutonomousTurn(input: RestappAutonomousTurnInput) {
  const phase = input.phase || 'exploring';
  const maxSteps = Math.min(8, Math.max(1, input.maxSteps || 5));
  const execution = input.execution || {};
  execution.state ||= {};

  const selected = selectRestappAgentTools({
    message: input.message,
    phase,
    maxTools: Math.min(12, Math.max(4, input.maxTools || 12)),
    includeAdmin: Boolean(execution.internal),
  });
  const tools = selected.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.llmName,
      description: `${tool.description}${tool.requiresConfirmation ? ' Requiere confirmación explícita.' : ''}`,
      parameters: tool.parameters,
    },
  }));

  const trace: RestappAgentTraceItem[] = [];
  let finalText = '';
  let lastRaw: unknown = null;

  for (let step = 0; step < maxSteps; step += 1) {
    const response = await input.llm.complete({
      teamId: input.teamId,
      message: input.message,
      phase,
      tools,
      trace,
      state: execution.state,
      system: systemPrompt(phase),
    });
    lastRaw = response.raw;
    const calls = Array.isArray(response.toolCalls) ? response.toolCalls.filter((x) => x?.name) : [];

    if (!calls.length) {
      finalText = String(response.text || '').trim();
      break;
    }

    const batch = await executeBatch(input.teamId, calls, execution);
    trace.push(...batch);
    if (response.text) finalText = String(response.text).trim();
  }

  return {
    ok: true,
    text: finalText,
    phase,
    selected_tools: selected.map((x) => x.id),
    trace,
    state: execution.state,
    raw: lastRaw,
    exhausted: !finalText && trace.length > 0,
  };
}

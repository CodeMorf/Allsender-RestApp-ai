import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-950 text-zinc-50 p-4 rounded-md overflow-x-auto text-xs font-mono">
      {children}
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.95em] px-1 py-0.5 rounded bg-muted">{children}</span>;
}

/**
 * Documentación del módulo RestaPP AI dentro de Developers.
 * Separada de Ventas IA (/api/developers/orders) y de mensajería.
 */
export default function DevelopersRestappDocsPage() {
  const base = 'https://auth.allsender.tech/api/restapp-ai/v1';
  const openapi = 'https://auth.allsender.tech/restapp-ai.openapi.json';

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Módulo · RestaPP AI</p>
          <h1 className="text-2xl font-bold text-foreground">API RestaPP AI · Developers</h1>
          <p className="text-muted-foreground">
            Importar catálogo/mesas/empresa a AllSender y sincronizar al CRM lo que la IA creó. Misma API Key que el resto
            de Developers; base y contratos separados de Ventas IA.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="../docs">← Docs generales</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="../../developers">← Developers</Link>
          </Button>
          <Button asChild className="bg-orange-600 hover:bg-orange-700">
            <a href={openapi} download="restapp-ai.openapi.json">
              Descargar OpenAPI
            </a>
          </Button>
        </div>
      </div>

      <Card className="mb-6 border-orange-200 dark:border-border">
        <CardHeader>
          <CardTitle>Separación por módulo (importante)</CardTitle>
          <CardDescription>No mezclar contratos.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto text-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4">Módulo</th>
                <th className="py-2 pr-4">Base API</th>
                <th className="py-2">OpenAPI</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium">Mensajería / plataforma</td>
                <td className="py-2 pr-4 font-mono text-xs">/api/... mensajes, webhooks</td>
                <td className="py-2">
                  <a className="underline" href="/openapi.json">
                    /openapi.json
                  </a>
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium">Ventas IA</td>
                <td className="py-2 pr-4 font-mono text-xs">/api/developers/orders</td>
                <td className="py-2 text-muted-foreground">En docs generales §7</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium text-orange-800 dark:text-orange-200">RestaPP AI</td>
                <td className="py-2 pr-4 font-mono text-xs">/api/restapp-ai/v1</td>
                <td className="py-2">
                  <a className="underline font-medium" href={openapi}>
                    /restapp-ai.openapi.json
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-muted-foreground">
            Auth en todos: <InlineCode>Authorization: Bearer ALLSENDER_API_KEY</InlineCode> creada en esta misma
            pantalla Developers.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Arquitectura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Entrada:</strong> POS/CRM →{' '}
                <InlineCode>POST {base}/import</InlineCode> (nombre, dirección, menú, mesas, sucursales).
              </li>
              <li>
                <strong className="text-foreground">Canal:</strong> WhatsApp/redes en Canales; motor IA en Ajustes → IA
                (misma key/créditos del equipo).
              </li>
              <li>
                <strong className="text-foreground">IA:</strong> crea pedidos/reservas en tablas RestaPP.
              </li>
              <li>
                <strong className="text-foreground">Salida CRM:</strong> GET pedidos o webhook; tu plataforma cocina y
                hace el delivery.
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>OpenAPI para IA y devs</CardTitle>
            <CardDescription>Claude, ChatGPT, Grok, Cursor, Postman, SDK generators.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <CodeBlock>{`curl -O ${openapi}

# Prompt sugerido:
# "Implementa un cliente TypeScript/Python con este OpenAPI de AllSender RestaPP AI.
#  Flujos: import catálogo y mesas; poll de orders para CRM; PATCH de estados."`}</CodeBlock>
            <Button asChild className="bg-orange-600 hover:bg-orange-700">
              <a href={openapi} download="restapp-ai.openapi.json">
                Descargar restapp-ai.openapi.json
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Endpoints por dirección</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="in">
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="in">Importar → AllSender</TabsTrigger>
                <TabsTrigger value="out">CRM ← pedidos IA</TabsTrigger>
                <TabsTrigger value="delivery">Delivery</TabsTrigger>
              </TabsList>
              <TabsContent value="in" className="space-y-3 text-sm">
                <CodeBlock>{`POST ${base}/import
POST ${base}/restaurant
POST ${base}/products
POST ${base}/tables
POST ${base}/branches
GET  ${base}/menu
GET  ${base}/tables`}</CodeBlock>
              </TabsContent>
              <TabsContent value="out" className="space-y-3 text-sm">
                <CodeBlock>{`GET   ${base}/orders?since=&status=&limit=
GET   ${base}/reservations
PATCH ${base}/orders   # { id, status, external_id }
# Webhook a crm_webhook_url: order.created | reservation.created | order.updated`}</CodeBlock>
              </TabsContent>
              <TabsContent value="delivery" className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  AllSender estima cobertura/tarifa. La entrega la ejecuta el CRM (flota o su API de delivery).
                </p>
                <CodeBlock>{`POST ${base}/delivery-quote
{ "lat": 18.48, "lng": -69.93 }
# o { "address": "Calle X, Santo Domingo" } si hay Google Geocoding en el server`}</CodeBlock>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ejemplo end-to-end</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <CodeBlock>{`# 1) Import
curl -X POST "${base}/import" \\
  -H "Authorization: Bearer ALLSENDER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "restaurant": {
      "restaurant_name": "Pizza del Caribe",
      "address": "Av. Winston Churchill, Santo Domingo",
      "crm_webhook_url": "https://crm.tu-local.com/hooks/allsender",
      "delivery_mode": "crm",
      "is_active": true,
      "agent_enabled": true
    },
    "products": [
      { "external_id": "sku-1", "name": "Pizza Margarita", "price": 450, "category": "Pizzas" }
    ],
    "tables": [ { "code": "M1", "seats": 4 } ],
    "branches": [{
      "name": "Local", "lat": 18.47, "lng": -69.93,
      "coverage_km": 6, "delivery_fee": 80
    }]
  }'

# 2) CRM poll
curl "${base}/orders?limit=50" -H "Authorization: Bearer ALLSENDER_API_KEY"

# 3) CRM status after delivery
curl -X PATCH "${base}/orders" \\
  -H "Authorization: Bearer ALLSENDER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"id":123,"status":"completed","external_id":"CRM-9981"}'`}</CodeBlock>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enlaces</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <Button asChild variant="outline" size="sm">
              <Link href="/modulo/restapp-ai">Abrir RestaPP AI</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/modulo/restapp-ai/configuracion/docs/api">Docs en el módulo</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/ai">Motor IA del equipo</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/modulo/canales">Canales</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

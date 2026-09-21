import { GoogleGenAI } from '@google/genai';
import { AIExpenseExtraction, EXPENSE_CATEGORIES, PAYMENT_METHODS } from './types';

// Auto-load .env.local for standalone scripts if not already loaded by Next.js
if (!process.env.GEMINI_API_KEY) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env.local' });
    dotenv.config();
  } catch {
    // fallback
  }
}

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const extractionJsonSchema = {
  type: 'object',
  properties: {
    amount: {
      type: 'number',
      description: 'Monto numérico total del gasto (ej: 15000 para "15 lucas" o 120.50).',
    },
    currency: {
      type: 'string',
      enum: ['ARS', 'USD'],
      description: 'Moneda del gasto, ARS o USD.',
    },
    description: {
      type: 'string',
      description: 'Descripción concisa del gasto o nombre del comercio (ej: "Supermercado Coto", "Cena con amigos").',
    },
    category: {
      type: 'string',
      enum: [...EXPENSE_CATEGORIES],
      description: 'Categoría más adecuada para el gasto.',
    },
    payment_method: {
      type: 'string',
      enum: [...PAYMENT_METHODS],
      description: 'Método de pago detectado o inferido.',
    },
    installments_total: {
      type: 'integer',
      description: 'Cantidad de cuotas. 1 si es en un solo pago o al contado.',
    },
    date: {
      type: 'string',
      description: 'Fecha del gasto en formato YYYY-MM-DD. Si no se indica fecha pasada, usar la fecha de hoy.',
    },
    roast_comment: {
      type: 'string',
      description: 'Comentario breve (1-2 oraciones) ingenioso y con personalidad: sutil humor/roast si es gasto prescindible o delivery, o felicitación/ánimo si es esencial o ahorro.',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
        },
      },
      description: 'Lista de ítems detectados (opcional, especialmente útil en tickets).',
    },
  },
  required: ['amount', 'currency', 'description', 'category', 'payment_method', 'installments_total', 'roast_comment'],
};

function getSystemInstruction(): string {
  const today = new Date().toISOString().split('T')[0];
  return `Eres Jarvis, un asistente financiero personal experto, astuto y con humor sutil.
Tu trabajo es procesar entradas de gastos del usuario (texto, audio transcripto o fotos de comprobantes/tickets) y extraer la información en formato estructurado JSON.
Fecha de hoy: ${today}.

Reglas de interpretación:
1. Monto:
   - "15 lucas", "15k" = 15000.
   - En tickets, busca el TOTAL final a pagar.
   - Si no se especifica moneda, asume "ARS". Si menciona dólares, USD o u$s, asigna "USD".
2. Cuotas:
   - Si dice "en 3 cuotas", "en 6 pagos", "3 cuotas sin interés", asigna installments_total = 3 o 6, y payment_method = "Tarjeta Crédito".
   - Si no menciona cuotas, installments_total = 1.
3. Categorías permitidas:
   ${EXPENSE_CATEGORIES.join(', ')}.
4. Métodos de pago permitidos:
   ${PAYMENT_METHODS.join(', ')}.
5. Roast / Personalidad:
   - Si es gasto esencial (Supermercado, Medicamentos, Servicios del hogar): sé positivo y práctico.
   - Si es gasto discrecional (Delivery por 3ra vez, ropa cara, juegos, salidas costosas): haz un comentario irónico y gracioso pero simpático sobre su billetera.`;
}

async function callGeminiWithFallback(contents: any): Promise<AIExpenseExtraction> {
  const models = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: getSystemInstruction(),
          responseMimeType: 'application/json',
          responseJsonSchema: extractionJsonSchema,
          temperature: 0.2,
        },
      });

      if (response.text) {
        return JSON.parse(response.text) as AIExpenseExtraction;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Warning: Model ${model} failed, trying next fallback...`, err.message);
    }
  }

  throw lastError || new Error('Failed to generate content with Gemini');
}

export async function parseExpenseFromText(text: string): Promise<AIExpenseExtraction> {
  return callGeminiWithFallback(`Mensaje del usuario: "${text}"`);
}

export async function parseExpenseFromAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<AIExpenseExtraction> {
  const contents = [
    {
      inlineData: {
        data: audioBuffer.toString('base64'),
        mimeType: mimeType,
      },
    },
    'Escucha esta nota de voz donde el usuario relata un gasto. Transcríbela internamente y extrae los datos estructurados del gasto según las instrucciones.',
  ];
  return callGeminiWithFallback(contents);
}

export async function parseExpenseFromImage(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<AIExpenseExtraction> {
  const contents = [
    {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType,
      },
    },
    'Analiza esta foto de ticket o comprobante de compra. Extrae el comercio, total final a pagar, fecha, medio de pago y categoría adecuada.',
  ];
  return callGeminiWithFallback(contents);
}

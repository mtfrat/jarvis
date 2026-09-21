import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import { AIExpenseExtraction, EXPENSE_CATEGORIES, PAYMENT_METHODS } from './types';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

const extractionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    amount: {
      type: SchemaType.NUMBER,
      description: 'Monto numérico total del gasto (ej: 15000 para "15 lucas" o 120.50).',
    },
    currency: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['ARS', 'USD'],
      description: 'Moneda del gasto, ARS o USD.',
    },
    description: {
      type: SchemaType.STRING,
      description: 'Descripción concisa del gasto o nombre del comercio (ej: "Supermercado Coto", "Cena con amigos").',
    },
    category: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: [...EXPENSE_CATEGORIES],
      description: 'Categoría más adecuada para el gasto.',
    },
    payment_method: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: [...PAYMENT_METHODS],
      description: 'Método de pago detectado o inferido.',
    },
    installments_total: {
      type: SchemaType.INTEGER,
      description: 'Cantidad de cuotas. 1 si es en un solo pago o al contado.',
    },
    date: {
      type: SchemaType.STRING,
      description: 'Fecha del gasto en formato YYYY-MM-DD. Si no se indica fecha pasada, usar la fecha de hoy.',
    },
    roast_comment: {
      type: SchemaType.STRING,
      description: 'Comentario breve (1-2 oraciones) ingenioso y con personalidad: sutil humor/roast si es gasto prescindible o delivery, o felicitación/ánimo si es esencial o ahorro.',
    },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          price: { type: SchemaType.NUMBER },
        },
      },
      description: 'Lista de ítems detectados (opcional, especialmente útil en tickets).',
    },
  },
  required: ['amount', 'currency', 'description', 'category', 'payment_method', 'installments_total', 'roast_comment'],
};

function getSystemInstruction(todayDate: string): string {
  return `Eres Jarvis, un asistente financiero personal experto, astuto y con humor sutil.
Tu trabajo es procesar entradas de gastos del usuario (texto, audio transcripto o fotos de comprobantes/tickets) y extraer la información en formato estructurado JSON.
Fecha de hoy: ${todayDate}.

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

function getModel() {
  const today = new Date().toISOString().split('T')[0];
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: getSystemInstruction(today),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: extractionSchema,
      temperature: 0.2,
    },
  });
}

export async function parseExpenseFromText(text: string): Promise<AIExpenseExtraction> {
  const model = getModel();
  const response = await model.generateContent(`Mensaje del usuario: "${text}"`);
  const jsonText = response.response.text();
  return JSON.parse(jsonText) as AIExpenseExtraction;
}

export async function parseExpenseFromAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<AIExpenseExtraction> {
  const model = getModel();
  const audioPart = {
    inlineData: {
      data: audioBuffer.toString('base64'),
      mimeType: mimeType,
    },
  };
  const prompt = 'Escucha esta nota de voz donde el usuario relata un gasto. Transcríbela internamente y extrae los datos estructurados del gasto según las instrucciones.';
  const response = await model.generateContent([prompt, audioPart]);
  const jsonText = response.response.text();
  return JSON.parse(jsonText) as AIExpenseExtraction;
}

export async function parseExpenseFromImage(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<AIExpenseExtraction> {
  const model = getModel();
  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: mimeType,
    },
  };
  const prompt = 'Analiza esta foto de ticket o comprobante de compra. Extrae el comercio, total final a pagar, fecha, medio de pago y categoría adecuada.';
  const response = await model.generateContent([prompt, imagePart]);
  const jsonText = response.response.text();
  return JSON.parse(jsonText) as AIExpenseExtraction;
}

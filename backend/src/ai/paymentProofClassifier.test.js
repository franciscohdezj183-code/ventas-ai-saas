import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPaymentProof } from './paymentProofClassifier.js';

describe('payment proof classifier', () => {
  it('rejects unsupported file types', async () => {
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'document',
      mimetype: 'text/plain',
      filename: 'nota.txt'
    });

    assert.equal(result.accepted, false);
    assert.match(result.reason, /imagen ni PDF/i);
  });

  it('rejects PDFs without payment proof hints', async () => {
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'document',
      mimetype: 'application/pdf',
      filename: 'catalogo.pdf'
    });

    assert.equal(result.accepted, false);
  });

  it('accepts PDFs with payment proof hints in the filename or caption', async () => {
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'document',
      mimetype: 'application/pdf',
      filename: 'comprobante-transferencia.pdf',
      caption: 'Pago SPEI realizado'
    });

    assert.equal(result.accepted, true);
  });

  it('uses AI results over OCR text for image files', async () => {
    const client = {
      chat: {
        completions: {
          async create() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      parece_comprobante: true,
                      confianza: 90,
                      banco: 'BBVA',
                      monto: 400,
                      fecha: '24/06/2026',
                      folio: 'ABC123456',
                      motivo: 'Tiene monto, fecha y folio'
                    })
                  }
                }
              ]
            };
          }
        }
      }
    };
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'foto.jpg',
      data: 'base64-data'
    }, {
      client,
      expectedAmount: 400,
      ocrReader: async () => ({
        available: true,
        text: 'BBVA transferencia SPEI monto $400.00 fecha 24/06/2026 folio ABC123456'
      })
    });

    assert.equal(result.accepted, true);
    assert.equal(result.confidence, 90);
  });

  it('accepts image proofs from OCR text with enough banking evidence', async () => {
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'foto.jpg',
      data: 'base64-data'
    }, {
      client: null,
      expectedAmount: 400,
      ocrReader: async () => ({
        available: true,
        text: 'Comprobante de transferencia BBVA $400.00 MXN 24/06/2026 referencia ABC123456 para Juan'
      })
    });

    assert.equal(result.accepted, true);
    assert.ok(result.confidence >= 70);
  });

  it('does not accept image proofs only by filename hints', async () => {
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'comprobante-bbva.jpg'
    }, { client: null });

    assert.equal(result.accepted, false);
    assert.equal(result.confidence, 0);
  });

  it('rejects generic image files when OCR is unavailable and OpenAI cannot be used', async () => {
    const client = {
      chat: {
        completions: {
          async create() {
            const error = new Error('Incorrect API key');
            error.code = 'invalid_api_key';
            error.status = 401;
            throw error;
          }
        }
      }
    };
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'image.jpg',
      data: 'base64-data'
    }, { client });

    assert.equal(result.accepted, false);
    assert.equal(result.confidence, 0);
    assert.match(result.reason, /texto suficiente|captura mas clara/i);
  });

  it('uses vision OCR fallback when local OCR is unavailable and then validates only extracted text', async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          async create(payload) {
            calls.push(payload);

            if (calls.length === 1) {
              return {
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        parece_comprobante: false,
                        confianza: 45,
                        banco: null,
                        tipo_pago: null,
                        monto: null,
                        fecha: null,
                        folio: null,
                        evidencia: [],
                        motivo: 'La imagen requiere OCR para confirmar datos'
                      })
                    }
                  }
                ]
              };
            }

            if (calls.length === 2) {
              return {
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        texto_visto: 'Comprobante de transferencia Mercado Pago $100 MXN 24 de junio de 2026 folio 123456789',
                        calidad: 'alta',
                        motivo: 'Texto legible'
                      })
                    }
                  }
                ]
              };
            }

            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      parece_comprobante: true,
                      confianza: 92,
                      banco: 'Mercado Pago',
                      monto: 100,
                      fecha: '24 de junio de 2026',
                      folio: '123456789',
                      motivo: 'El texto OCR contiene banco, monto, fecha y folio'
                    })
                  }
                }
              ]
            };
          }
        }
      }
    };
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'foto.jpg',
      data: 'base64-data'
    }, {
      client,
      expectedAmount: 100,
      ocrReader: async () => ({
        available: false,
        text: '',
        reason: 'No fue posible ejecutar OCR local'
      })
    });

    assert.equal(result.accepted, true);
    assert.equal(result.detected.bank, 'Mercado Pago');
    assert.equal(calls.length, 3);
    assert.match(calls[2].messages[1].content, /Texto OCR:/);
  });

  it('accepts image proofs by visual analysis even when OCR text is weak', async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          async create(payload) {
            calls.push(payload);

            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      parece_comprobante: true,
                      confianza: 91,
                      banco: 'Mercado Pago',
                      tipo_pago: 'transferencia',
                      monto: 100,
                      fecha: '24 de junio de 2026',
                      folio: null,
                      evidencia: ['wallet Mercado Pago', 'monto $100 MXN', 'fecha visible', 'origen y destino con CLABE'],
                      motivo: 'Se observa una captura de comprobante de transferencia con monto, fecha y datos de cuentas'
                    })
                  }
                }
              ]
            };
          }
        }
      }
    };
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'foto.jpg',
      data: 'base64-data'
    }, {
      client,
      expectedAmount: 100,
      ocrReader: async () => ({
        available: true,
        text: 'Comprobante de transferencia',
        reason: 'OCR incompleto'
      })
    });

    assert.equal(result.accepted, true);
    assert.equal(result.detected.bank, 'Mercado Pago');
    assert.equal(calls.length, 2);
  });

  it('accepts visual proof evidence even when structured fields are incomplete', async () => {
    const client = {
      chat: {
        completions: {
          async create() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      parece_comprobante: true,
                      confianza: 88,
                      banco: null,
                      tipo_pago: null,
                      monto: null,
                      fecha: null,
                      folio: null,
                      evidencia: ['Comprobante de transferencia Mercado Pago', '$100 MXN visible', 'CLABE destino visible'],
                      motivo: 'La imagen contiene formato de comprobante, monto y datos de cuenta'
                    })
                  }
                }
              ]
            };
          }
        }
      }
    };
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'foto.jpg',
      data: 'base64-data'
    }, {
      client,
      expectedAmount: 100,
      ocrReader: async () => ({
        available: false,
        text: '',
        reason: 'No fue posible ejecutar OCR local'
      })
    });

    assert.equal(result.accepted, true);
    assert.match(result.reason, /formato de comprobante/i);
  });

  it('accepts payment proof even when amount is lower than expected and confidence uses 0 to 1 scale', async () => {
    const client = {
      chat: {
        completions: {
          async create() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      parece_comprobante: true,
                      confianza: 0.8,
                      banco: 'Mercado Pago Wallet',
                      tipo_pago: 'transferencia',
                      monto: 100,
                      fecha: '2026-06-24 09:22',
                      folio: '164778858189',
                      evidencia: ['Mercado Pago Wallet', '$100 MXN', 'fecha visible', 'folio visible'],
                      motivo: 'Es un comprobante de transferencia de Mercado Pago Wallet con monto, fecha y folio visibles.'
                    })
                  }
                }
              ]
            };
          }
        }
      }
    };
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'comprobante.jpg',
      data: 'base64-data'
    }, {
      client,
      expectedAmount: 400,
      ocrReader: async () => ({
        available: false,
        text: '',
        reason: 'No fue posible ejecutar OCR local'
      })
    });

    assert.equal(result.accepted, true);
    assert.equal(result.confidence, 80);
    assert.equal(result.detected.amount, 100);
  });

  it('rejects random images when vision OCR extracts non banking text', async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          async create(payload) {
            calls.push(payload);

            if (calls.length === 1) {
              return {
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        parece_comprobante: false,
                        confianza: 8,
                        banco: null,
                        tipo_pago: null,
                        monto: null,
                        fecha: null,
                        folio: null,
                        evidencia: [],
                        motivo: 'La imagen muestra personas y no contiene datos bancarios'
                      })
                    }
                  }
                ]
              };
            }

            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      texto_visto: 'Nightout Downtown Y2K',
                      calidad: 'media',
                      motivo: 'Solo se ve texto decorativo'
                    })
                  }
                }
              ]
            };
          }
        }
      }
    };
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'foto.jpg',
      data: 'base64-data'
    }, {
      client,
      expectedAmount: 100,
      ocrReader: async () => ({
        available: false,
        text: '',
        reason: 'No fue posible ejecutar OCR local'
      })
    });

    assert.equal(result.accepted, false);
    assert.equal(calls.length, 2);
    assert.match(result.reason, /personas|datos bancarios|texto suficiente/i);
  });

  it('rejects image proofs when OCR text is insufficient', async () => {
    const result = await classifyPaymentProof({
      hasMedia: true,
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'foto.jpg',
      data: 'base64-data'
    }, {
      client: null,
      ocrReader: async () => ({
        available: true,
        text: 'Nightout downtown'
      })
    });

    assert.equal(result.accepted, false);
    assert.match(result.reason, /texto suficiente/i);
  });
});

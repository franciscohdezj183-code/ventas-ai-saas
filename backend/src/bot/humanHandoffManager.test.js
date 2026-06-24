import assert from 'node:assert/strict';
import test from 'node:test';
import { findOwnerPendingHandoff } from './humanHandoffManager.js';
import { buildReadableOwnerNotification } from './ownerNotificationFormatter.js';

test('solo permite responder un handoff al telefono del dueno asignado', () => {
  const rows = [{
    id: 24,
    telefono_cliente: '+52 729 834 9854',
    telefono_dueno: '+52 220 572 2560',
    codigo: '48261V2'
  }, {
    id: 25,
    telefono_cliente: '+52 771 244 4430',
    telefono_dueno: '+52 220 572 2560',
    codigo: '99123AB'
  }];

  assert.equal(findOwnerPendingHandoff(rows, '+52 220 572 2560')?.id, 24);
  assert.equal(findOwnerPendingHandoff(rows, '+52 220 572 2560', '99123AB')?.id, 25);
  assert.equal(findOwnerPendingHandoff(rows, '+52 220 572 2560', '99123ab')?.id, 25);
  assert.equal(findOwnerPendingHandoff(rows, '+52 220 572 2560', '00000ZZ'), null);
  assert.equal(findOwnerPendingHandoff(rows, '+52 220 564 2307'), null);
});

test('formatea el aviso al dueno con resumen claro y sin repetir el mensaje', () => {
  const customerMessage = 'Hola, me llamo Francisco. Tengo una cafetería llamada Café Luna y quiero renovar mi imagen. Necesito logo, colores, publicaciones para Instagram y una cotización. ¿Me pueden ayudar?';
  const message = buildReadableOwnerNotification({
    title: 'Nuevo cliente necesita seguimiento',
    customerPhone: '+527298349854',
    companyName: 'MOK Estudio + Taller',
    requestSummary: 'Cliente: Francisco | Telefono: +527298349854 | Solicitud: producto/compra | Negocio del cliente: Cafe Luna | Necesita: renovar imagen, logotipo, colores, publicaciones para instagram, cotización | Resumen: Cliente llamado Francisco con cafetería Cafe Luna quiere renovar su imagen incluyendo logotipo, colores, publicaciones para Instagram y solicita cotización. | Mensaje: Hola, me llamo Francisco. Tengo una cafetería llamada Café Luna y quiero renovar mi imagen. Necesito logo, colores, publicaciones para Instagram y una cotización. ¿Me pueden ayudar?',
    customerMessage,
    botResponse: 'Ya avise a un asesor. Mientras tanto puedo seguir resolviendo tus dudas.',
    botStatus: 'Requiere apoyo de un asesor. El bot ya aviso al cliente que un asesor puede apoyarlo.',
    includeDecisionPrompt: true,
    decisionCode: '48261V2',
    timeoutMinutes: 5
  });

  assert.match(message, /Cliente: Francisco/);
  assert.match(message, /Negocio del cliente: Cafe Luna/);
  assert.match(message, /Que necesita:\n- Renovar imagen\n- Logotipo\n- Colores\n- Publicaciones para instagram\n- Cotización/);
  assert.match(message, /Resumen para seguimiento:/);
  assert.match(message, /Mensaje original del cliente:/);
  assert.match(message, /Codigo: 48261V2/);
  assert.match(message, /si 48261V2/);
  assert.match(message, /no 48261V2/);
  assert.match(message, /Tienes 5 minutos/);
  assert.equal(message.match(/Hola, me llamo Francisco/g).length, 1);
  assert.doesNotMatch(message, /Solicitud: Cliente: Francisco/);
});

export const evaluationServices = [
  { id: 1, nombre: 'Reparacion de refrigeradores', descripcion: 'Tecnico en refrigeracion, linea blanca, diagnostico y falla de enfriamiento', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Refrigeracion' },
  { id: 2, nombre: 'Plomeria residencial', descripcion: 'Reparacion de fuga en lavabo, bano, tuberia e instalacion hidraulica', precio: 450, tipo_precio: 'DESDE', categoria: 'Plomeria' },
  { id: 3, nombre: 'Instalacion de camaras de seguridad', descripcion: 'CCTV, videovigilancia, monitoreo e instalacion de camaras', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Seguridad' },
  { id: 4, nombre: 'Mantenimiento de computadoras', descripcion: 'Soporte tecnico para computadora lenta, virus, laptop o PC', precio: 350, tipo_precio: 'DESDE', categoria: 'Computadoras' },
  { id: 5, nombre: 'Asesoria fiscal y declaraciones', descripcion: 'Contabilidad, impuestos, SAT, facturas y declaracion mensual o anual', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Contabilidad' },
  { id: 6, nombre: 'Consulta dental', descripcion: 'Valoracion por dolor de muela, diente, encia y urgencia dental', precio: 600, tipo_precio: 'FIJO', categoria: 'Dental' },
  { id: 7, nombre: 'Revision de instalacion electrica', descripcion: 'Diagnostico tecnico, mantenimiento y revision de instalaciones', precio: 500, tipo_precio: 'DESDE', categoria: 'Instalaciones' }
];

export const evaluationProducts = [
  { id: 20, nombre: 'Set de tazas para regalo', descripcion: 'Regalo economico para oficina y hogar', precio: 180, stock: 10, categoria: 'Regalos' },
  { id: 21, nombre: 'Comedor pequeno 4 sillas', descripcion: 'Comedor compacto para departamento pequeno', precio: 4200, stock: 3, categoria: 'Comedores' },
  { id: 22, nombre: 'Comedor economico 2 sillas', descripcion: 'Opcion similar mas economica para espacios pequenos', precio: 2800, stock: 2, categoria: 'Comedores' },
  { id: 23, nombre: 'Silla auxiliar economica', descripcion: 'Producto barato para regalo o comedor pequeno', precio: 399, stock: 6, categoria: 'Sillas' }
];

const serviceContext = {
  ultima_intencion: 'BUSCAR_SERVICIO',
  ultimo_producto_id: null,
  ultimo_servicio_id: 1,
  ultimo_texto_busqueda: 'Reparacion de refrigeradores',
  datos_json: { servicio: evaluationServices[0] }
};

const productContext = {
  ultima_intencion: 'BUSCAR_PRODUCTO',
  ultimo_producto_id: 21,
  ultimo_servicio_id: null,
  ultimo_texto_busqueda: 'Comedor pequeno 4 sillas',
  datos_json: {
    producto: evaluationProducts[1],
    ultima_lista_productos: evaluationProducts.slice(1, 3)
  }
};

export const evaluationCases = [
  { id: 'svc-refrigerador', group: 'SERVICIOS', message: 'mi refrigerador ya no enfria', expectedType: 'service', expectedIntent: 'BUSCAR_SERVICIO', expectedEntity: 'refrigeracion', mustAskIfMissing: false },
  { id: 'svc-fuga-lavabo', group: 'SERVICIOS', message: 'tengo fuga debajo del lavabo', expectedType: 'service', expectedIntent: 'BUSCAR_SERVICIO', expectedEntity: 'plomeria', mustAskIfMissing: false },
  { id: 'svc-camaras', group: 'SERVICIOS', message: 'quiero instalar camaras', expectedType: 'service', expectedIntent: 'BUSCAR_SERVICIO', expectedEntity: 'camaras', mustAskIfMissing: false },
  { id: 'svc-compu-lenta', group: 'SERVICIOS', message: 'mi compu esta muy lenta', expectedType: 'service', expectedIntent: 'BUSCAR_SERVICIO', expectedEntity: 'computadoras', mustAskIfMissing: false },
  { id: 'svc-impuestos', group: 'SERVICIOS', message: 'necesito declarar impuestos', expectedType: 'service', expectedIntent: 'BUSCAR_SERVICIO', expectedEntity: 'contabilidad', mustAskIfMissing: false },
  { id: 'svc-muela', group: 'SERVICIOS', message: 'me duele una muela', expectedType: 'service', expectedIntent: 'BUSCAR_SERVICIO', expectedEntity: 'dental', mustAskIfMissing: false },
  { id: 'svc-instalacion', group: 'SERVICIOS', message: 'ocupo que vengan a revisar mi instalacion', expectedType: 'service', expectedIntent: 'BUSCAR_SERVICIO', expectedEntity: 'instalacion', mustAskIfMissing: false },
  { id: 'svc-precio-contexto', group: 'SERVICIOS', message: 'cuanto cobran por eso', expectedType: 'service', expectedIntent: 'CONSULTAR_PRECIO', context: serviceContext, mustAskIfMissing: false },
  { id: 'svc-manana-contexto', group: 'SERVICIOS', message: 'y si es para manana?', expectedType: 'schedule', expectedIntent: 'AGENDAR_CITA', context: serviceContext, mustAskIfMissing: true },
  { id: 'svc-interes-contexto', group: 'SERVICIOS', message: 'me interesa, cuanto seria?', expectedType: 'service', expectedIntent: 'INTENCION_COMPRA', context: serviceContext, mustAskIfMissing: false },
  { id: 'prd-regalo-barato', group: 'PRODUCTOS', message: 'busco algo barato para regalo', expectedType: 'product', expectedIntent: 'BUSCAR_PRODUCTO', mustAskIfMissing: false },
  { id: 'prd-comedor-pequeno', group: 'PRODUCTOS', message: 'tienen comedores pequenos?', expectedType: 'product', expectedIntent: 'BUSCAR_PRODUCTO', mustAskIfMissing: false },
  { id: 'prd-parecido-economico', group: 'PRODUCTOS', message: 'algo parecido pero mas economico', expectedType: 'product', expectedIntent: 'BUSCAR_PRODUCTO', context: productContext, mustAskIfMissing: true },
  { id: 'prd-segunda-opcion', group: 'PRODUCTOS', message: 'la segunda opcion', expectedType: 'product', expectedIntent: 'INTENCION_COMPRA', context: productContext, mustAskIfMissing: false },
  { id: 'prd-ese-interesa', group: 'PRODUCTOS', message: 'ese me interesa', expectedType: 'product', expectedIntent: 'INTENCION_COMPRA', context: productContext, mustAskIfMissing: false },
  { id: 'prd-disponible', group: 'PRODUCTOS', message: 'lo tienen disponible?', expectedType: 'product', expectedIntent: 'CONSULTAR_STOCK', context: productContext, mustAskIfMissing: false },
  { id: 'prd-envio', group: 'PRODUCTOS', message: 'cuanto sale con envio?', expectedType: 'product', expectedIntent: 'CONSULTAR_PRECIO', context: productContext, mustAskIfMissing: false }
];

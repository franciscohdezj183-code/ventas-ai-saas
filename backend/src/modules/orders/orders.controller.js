import {
  createOrder,
  deleteOrder,
  findOrderById,
  findOrders,
  updateOrder
} from './orders.service.js';
import { auditFromRequest } from '../audit/audit.service.js';

export async function listOrders(req, res, next) {
  try {
    res.json({ data: await findOrders(req.auth) });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req, res, next) {
  try {
    const order = await findOrderById(req.params.id, req.auth);

    if (!order) {
      res.status(404).json({ message: 'Pedido no encontrado' });
      return;
    }

    res.json({ data: order });
  } catch (error) {
    next(error);
  }
}

export async function storeOrder(req, res, next) {
  try {
    const order = await createOrder(req.body, req.auth);
    await auditFromRequest(req, {
      accion: 'CREAR',
      modulo: 'pedidos',
      descripcion: `Pedido creado: #${order.id}`,
      empresaId: order.empresa_id
    });
    res.status(201).json({ data: order });
  } catch (error) {
    next(error);
  }
}

export async function patchOrder(req, res, next) {
  try {
    const order = await updateOrder(req.params.id, req.body, req.auth);
    await auditFromRequest(req, {
      accion: 'ACTUALIZAR',
      modulo: 'pedidos',
      descripcion: `Pedido actualizado: #${order.id}`,
      empresaId: order.empresa_id
    });
    res.json({ data: order });
  } catch (error) {
    next(error);
  }
}

export async function removeOrder(req, res, next) {
  try {
    await deleteOrder(req.params.id, req.auth);
    await auditFromRequest(req, {
      accion: 'ELIMINAR',
      modulo: 'pedidos',
      descripcion: `Pedido eliminado: #${req.params.id}`
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

import {
  createLead,
  deleteLead,
  findLeadById,
  findLeads,
  getLeadStats,
  updateLead
} from './leads.service.js';

export async function listLeads(req, res, next) {
  try {
    res.json({ data: await findLeads(req.auth) });
  } catch (error) {
    next(error);
  }
}

export async function leadStats(req, res, next) {
  try {
    res.json({ data: await getLeadStats(req.auth) });
  } catch (error) {
    next(error);
  }
}

export async function getLead(req, res, next) {
  try {
    const lead = await findLeadById(req.params.id, req.auth);

    if (!lead) {
      res.status(404).json({ message: 'Lead no encontrado' });
      return;
    }

    res.json({ data: lead });
  } catch (error) {
    next(error);
  }
}

export async function storeLead(req, res, next) {
  try {
    const lead = await createLead(req.body, req.auth);
    res.status(201).json({ data: lead });
  } catch (error) {
    next(error);
  }
}

export async function patchLead(req, res, next) {
  try {
    const lead = await updateLead(req.params.id, req.body, req.auth);
    res.json({ data: lead });
  } catch (error) {
    next(error);
  }
}

export async function removeLead(req, res, next) {
  try {
    await deleteLead(req.params.id, req.auth);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

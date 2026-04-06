const levelService = require("../services/level.service");
const { toPagedResult } = require("../utils/paging");

async function create(req, res, next) {
  try {
    const data = await levelService.createLevel(req.user.id, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

async function update(req, res, next) {
  try {
    const data = await levelService.updateLevel(req.user.id, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

async function remove(req, res, next) {
  try {
    const data = await levelService.deleteLevel(req.user.id, req.params.id);
    res.json(data);
  } catch (e) { next(e); }
}

async function getById(req, res, next) {
  try {
    const data = await levelService.getLevelById(req.params.id);
    res.json(data);
  } catch (e) { next(e); }
}

async function getBySection(req, res, next) {
  try {
    const data = await levelService.getLevelsBySection(req.params.sectionId);
    res.json(data);
  } catch (e) { next(e); }
}

async function paged(req, res, next) {
  try {
    const { data, pageNumber, pageSize, totalCount } =
      await levelService.getLevelsPaged(req.body || {});
    res.json(toPagedResult(data, pageNumber, pageSize, totalCount));
  } catch (e) { next(e); }
}

async function reorder(req, res, next) {
  try {
    const data = await levelService.reorderLevels(req.user.id, req.params.sectionId, req.body || []);
    res.json(data);
  } catch (e) { next(e); }
}

async function duplicate(req, res, next) {
  try {
    const data = await levelService.duplicateLevel(req.user.id, req.params.id);
    res.json(data);
  } catch (e) { next(e); }
}

module.exports = { create, update, remove, getById, getBySection, paged, reorder, duplicate };

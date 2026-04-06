const sectionService = require("../services/section.service");
const { toPagedResult } = require("../utils/paging");

async function create(req, res, next) {
  try {
    const data = await sectionService.createSection(req.user.id, req.body);
    return res.json(data);
  } catch (e) {
    next(e);
  }
}

async function update(req, res, next) {
  try {
    const data = await sectionService.updateSection(req.user.id, req.body);
    return res.json(data);
  } catch (e) {
    next(e);
  }
}

async function remove(req, res, next) {
  try {
    const data = await sectionService.deleteSection(req.user.id, req.params.id);
    return res.json(data);
  } catch (e) {
    next(e);
  }
}

async function getById(req, res, next) {
  try {
    const data = await sectionService.getSectionById(req.params.id);
    return res.json(data);
  } catch (e) {
    next(e);
  }
}

async function getAll(req, res, next) {
  try {
    const data = await sectionService.getAllSectionsPublic();
    return res.json(data);
  } catch (e) {
    next(e);
  }
}

async function paged(req, res, next) {
  try {
    const { data, pageNumber, pageSize, totalCount } =
      await sectionService.getSectionsPaged(req.body || {});
    return res.json(toPagedResult(data, pageNumber, pageSize, totalCount));
  } catch (e) {
    next(e);
  }
}

async function reorder(req, res, next) {
  try {
    const data = await sectionService.reorderSections(req.user.id, req.body || []);
    return res.json(data);
  } catch (e) {
    next(e);
  }
}

async function getWithLevels(req, res, next) {
  try {
    const data = await sectionService.getSectionWithLevels(req.params.id);
    return res.json(data);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  create,
  update,
  remove,
  getById,
  getAll,
  paged,
  reorder,
  getWithLevels,
};

const svc = require("../services/question.service");
const { toPagedResult } = require("../utils/paging");

async function create(req, res, next) {
  try { res.json(await svc.createQuestion(req.user.id, req.body)); }
  catch (e) { next(e); }
}

async function bulk(req, res, next) {
  try { res.json(await svc.bulkCreateQuestions(req.user.id, req.body)); }
  catch (e) { next(e); }
}

async function update(req, res, next) {
  try { res.json(await svc.updateQuestion(req.user.id, req.body)); }
  catch (e) { next(e); }
}

async function remove(req, res, next) {
  try { res.json(await svc.deleteQuestion(req.user.id, req.params.id)); }
  catch (e) { next(e); }
}

async function deleteMultiple(req, res, next) {
  try { res.json(await svc.deleteMultipleQuestions(req.user.id, req.body || [])); }
  catch (e) { next(e); }
}

async function getById(req, res, next) {
  try { res.json(await svc.getQuestionById(req.params.id)); }
  catch (e) { next(e); }
}

async function getByLevel(req, res, next) {
  try { res.json(await svc.getQuestionsByLevel(req.params.levelId)); }
  catch (e) { next(e); }
}

async function paged(req, res, next) {
  try {
    const { data, pageNumber, pageSize, totalCount } = await svc.getQuestionsPaged(req.body || {});
    res.json(toPagedResult(data, pageNumber, pageSize, totalCount));
  } catch (e) { next(e); }
}

async function reorder(req, res, next) {
  try { res.json(await svc.reorderQuestions(req.user.id, req.params.levelId, req.body || [])); }
  catch (e) { next(e); }
}

async function duplicate(req, res, next) {
  try { res.json(await svc.duplicateQuestion(req.user.id, req.params.id)); }
  catch (e) { next(e); }
}

async function importJson(req, res, next) {
  try { res.json(await svc.importQuestionsJson(req.user.id, req.body || {})); }
  catch (e) { next(e); }
}

module.exports = {
  create,
  bulk,
  update,
  remove,
  deleteMultiple,
  getById,
  getByLevel,
  paged,
  reorder,
  duplicate,
  importJson,
};

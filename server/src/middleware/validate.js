export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const key of ["body", "params", "query"]) {
    if (schemas[key]) req.valid[key] = schemas[key].parse(req[key] ?? {}); // ZodError → 400 via errorHandler
  }
  next();
};

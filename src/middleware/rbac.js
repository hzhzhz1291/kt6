const { HttpError } = require('./errorHandler');

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Access denied'));
    next();
  };
}

function allowSelfOr(...roles) {
  return (req, res, next) => {
    if (req.user.id !== res.locals.params.id && !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Access denied'));
    }
    next();
  };
}

module.exports = { allowRoles, allowSelfOr };

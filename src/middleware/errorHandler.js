class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function notFound(req, res, next) {
  next(new HttpError(404, 'Route not found'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.code === 'P2002') error = new HttpError(409, 'A record with this value already exists');
  if (error.code === 'P2003') error = new HttpError(404, 'Related record not found');
  if (error.code === 'P2025') error = new HttpError(404, 'Record not found');
  if (error.type === 'entity.parse.failed') error = new HttpError(400, 'Invalid JSON');
  if (error.type === 'entity.too.large') error = new HttpError(413, 'Request body is too large');

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status : 500;
  const body = { error: { message: status >= 500 ? 'Internal server error' : error.message } };
  if (status >= 500) {
    console.error(error);
    if (process.env.NODE_ENV === 'development') body.error.stack = error.stack;
  }
  res.status(status).json(body);
}

module.exports = { HttpError, notFound, errorHandler };

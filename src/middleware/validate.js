const Joi = require('joi');

const id = Joi.number().integer().min(1).max(2147483647);
const idParams = Joi.object({ id: id.required() });
const pageFields = {
  page: Joi.number().integer().min(1).max(1000000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
};

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.required().validate(req[source], { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: { message: 'Validation failed', details: error.details.map((item) => item.message) },
      });
    }
    res.locals[source] = value;
    next();
  };
}

module.exports = { validate, id, idParams, pageFields };

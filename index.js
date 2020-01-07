'use strict';

const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');

const defaultLogError = (err) => {
    // Only log internal server errors
    if (!err.isServer) {
        return;
    }

    // Log original error if passed
    if (err.data && err.data.originalError) {
        err = err.data.originalError;
    }

    console.error(err.stack);
};

const defaultSendError = (res, err) => {
    const { output } = err;
    const { headers, statusCode, payload } = output;

    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));

    res.status(statusCode).json(payload);
};

const withValidation = (schemas) => (fn) => async (req, res) => {
    const joiSchema = Joi.object(schemas).unknown(true);

    let validated;

    try {
        validated = await joiSchema.validateAsync(req);
    } catch (err) {
        throw Boom.badRequest(err.message, { originalError: err });
    }

    // Joi normalizes values, so we must copy things back to req
    ['headers', 'body', 'query'].forEach((key) => {
        req[key] = validated[key];
    });

    return fn(req, res);
};

const withRest = (methods, options) => {
    options = {
        logError: defaultLogError,
        sendError: defaultSendError,
        ...options,
    };

    return async (req, res) => {
        try {
            const method = methods && methods[req.method];

            if (!method) {
                throw Boom.methodNotAllowed(`Method ${req.method} is not supported for this endpoint`);
            }

            const json = await method(req, res);

            // Do nothing if the request is already sent (e.g.: a redirect was issued)
            if (res.headersSent) {
                return;
            }

            // Next.js doesn't support nulls as `RFC7159` dictates, but we do
            if (json == null) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Content-Length', '4');
                res.end('null');
            } else {
                res.json(json);
            }
        } catch (err) {
            // Not an ApiError? Then wrap it into an ApiError and log it.
            if (!err.isBoom) {
                err = Boom.internal('foo', err);
            }

            options.logError(err);
            options.sendError(res, err);
        }
    };
};

module.exports = withRest;
module.exports.withValidation = withValidation;

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

/**
 * Wraps a HTTP request handler with validation against Joi schemas.
 *
 * @param {object} schemas - An object with `query`, `body` or `headers` keys and their associated Joi schemas.
 *                           Each of these schemas will be matched against the incoming request.
 *
 * @returns {Function} The HTTP handler that validates the request.
 *
 * @example
 *
 * const getSchema = {
 *   query: Joi.object({
 *      id: Joi.string().required(),
 *   }),
 * };
 *
 * export default withRest({
 *   GET: withValidation(getSchema)(async req, res) => {
 *     // Do something with `req.query.id`
 *
 *     return { foo: 'bar' };
 *   },
 * });
 */
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

/**
 * @typedef {Function} SendError
 *
 * @param {object} res - Node.js response object.
 * @param {Error} err - The Boom error object.
 */
/**
 * @typedef {Function} LogError
 *
 * @param {Error} err - The Boom error object.
 */

/**
 * Matches handlers defined in `methods` against the HTTP method, like `GET` or `POST`.
 *
 * @param {object.<string, Function>} methods - An object mapping HTTP methods to their handlers.
 * @param {object} options - The options.
 * @param {SendError} options.sendError - A function responsible to send Boom errors back to the client.
 * @param {LogError} options.logError - A function that logs errors.
 *
 * @returns {Function} The composed HTTP handler.
 *
 * @example
 *
 * export default withRest({
 *   GET: async (req, res) => {
 *     // Do something...
 *
 *     return { foo: 'bar' };
 *   },
 * });
 */
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
                if (json !== undefined) {
                    options.logError(
                        Boom.internal('You have sent the response inside your handler but still returned something. This error was not sent to the client, however you should probably not return a value in the handler.'), // eslint-disable-line max-len
                    );
                }

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
                err = Boom.internal('foo', { originalError: err });
            }

            options.logError(err);
            options.sendError(res, err);
        }
    };
};

module.exports = withRest;
module.exports.withValidation = withValidation;

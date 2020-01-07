'use strict';

const request = require('supertest');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const { apiResolver } = require('next/dist/next-server/server/api-utils');
const withRest = require('./');

const enhance = (handler) => (req, res) => apiResolver(req, res, undefined, handler);

beforeEach(() => {
    console.error.mock && console.error.mockRestore();
});

describe('withRest', () => {
    it('should respond what the handler returned', async () => {
        const app = withRest({
            GET: () => ({ foo: 'bar' }),
        });

        await request(enhance(app))
        .get('/')
        .expect(200)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toEqual({ foo: 'bar' });
        });
    });

    it('should support nullish responses', async () => {
        let app;

        app = withRest({
            GET: () => null,
        });

        await request(enhance(app))
        .get('/')
        .expect(200)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toBe(null);
        });

        app = withRest({
            GET: () => undefined,
        });

        await request(enhance(app))
        .get('/')
        .expect(200)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toBe(null);
        });
    });

    it('should do nothing if headers were already sent', async () => {
        jest.spyOn(console, 'error').mockImplementation();

        const app = withRest({
            POST: (req, res) => {
                res.status(201).send({ foo: 'bar' });
            },
        });

        await request(enhance(app))
        .post('/')
        .expect(201)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toEqual({ foo: 'bar' });
        });
    });

    it('should warn if the response was sent directly in the handler, but a valid JSON value was still returned', async () => {
        jest.spyOn(console, 'error').mockImplementation();

        const app = withRest({
            POST: (req, res) => {
                res.status(201).send({ foo: 'bar' });

                return { hello: 'world' };
            },
        });

        await request(enhance(app))
        .post('/')
        .expect(201)
        .expect('Content-Type', /^application\/json/)
        .then(() => {
            expect(console.error).toHaveBeenCalledTimes(1);
            expect(console.error.mock.calls[0][0]).toMatch(/Error: You have sent the response inside your handler but/);
        });
    });

    it('should respond with 405 if method is not supported', async () => {
        const app = withRest();

        await request(enhance(app))
        .get('/')
        .expect(405)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toEqual({
                statusCode: 405,
                error: 'Method Not Allowed',
                message: 'Method GET is not supported for this endpoint',
            });
        });
    });

    it('should respond with 500 if handlers throw standard errors', async () => {
        jest.spyOn(console, 'error').mockImplementation();

        const app = withRest({
            GET: () => {
                throw new Error('foo');
            },
        });

        await request(enhance(app))
        .get('/')
        .expect(500)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toEqual({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'An internal server error occurred',
            });
        });
    });

    it('should respond correctly if handlers throw Boom errors', async () => {
        let app;

        app = withRest({
            GET: () => {
                throw Boom.forbidden('foo', { bar: 'baz' });
            },
        });

        await request(enhance(app))
        .get('/')
        .expect(403)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toEqual({
                statusCode: 403,
                error: 'Forbidden',
                message: 'foo',
            });
        });

        // Case where Boom tells us  to output custom headers
        app = withRest({
            POST: () => {
                throw Boom.unauthorized('Invalid password', 'sample');
            },
        });

        await request(enhance(app))
        .post('/')
        .send({})
        .expect(401)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.headers).toMatchObject({
                'www-authenticate': 'sample error="Invalid password"',
            });
            expect(res.body).toEqual({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Invalid password',
                attributes: {
                    error: 'Invalid password',
                },
            });
        });
    });

    it('should log any 500 errors', async () => {
        jest.spyOn(console, 'error').mockImplementation();

        const app = withRest({
            GET: () => {
                throw Boom.internal('foo', { bar: 'baz' });
            },
        });

        await request(enhance(app))
        .get('/')
        .expect(500)
        .expect('Content-Type', /^application\/json/)
        .then(() => {
            expect(console.error).toHaveBeenCalledTimes(1);
            expect(console.error.mock.calls[0][0]).toMatch('Error: foo');
        });
    });

    it('should log original errors if they caused a 500 error', async () => {
        jest.spyOn(console, 'error').mockImplementation();

        const app = withRest({
            GET: () => {
                const originalError = new Error('bar');

                throw Boom.internal('foo', { originalError });
            },
        });

        await request(enhance(app))
        .get('/')
        .expect(500)
        .expect('Content-Type', /^application\/json/)
        .then(() => {
            expect(console.error).toHaveBeenCalledTimes(1);
            expect(console.error.mock.calls[0][0]).toMatch('Error: bar');
        });
    });

    describe('options', () => {
        it('should allow passing a custom sendError', async () => {
            jest.spyOn(console, 'error').mockImplementation();

            const sendError = jest.fn((res, error) => {
                res.status(500).send({ errorMessage: error.message });
            });

            const app = withRest({
                GET: () => {
                    throw Boom.internal('foo');
                },
            }, { sendError });

            await request(enhance(app))
            .get('/')
            .expect(500)
            .expect('Content-Type', /^application\/json/)
            .then((res) => {
                expect(sendError).toHaveBeenCalledTimes(1);
                expect(res.body).toEqual({ errorMessage: 'foo' });
            });
        });

        it('should allow passing a custom logError', async () => {
            jest.spyOn(console, 'error').mockImplementation();

            const logError = jest.fn((error) => {
                console.error(`> ${error.message}`);
            });

            const app = withRest({
                GET: () => {
                    throw Boom.internal('foo');
                },
            }, { logError });

            await request(enhance(app))
            .get('/')
            .expect(500)
            .expect('Content-Type', /^application\/json/)
            .then(() => {
                expect(logError).toHaveBeenCalledTimes(1);
                expect(console.error).toHaveBeenCalledTimes(1);
                expect(console.error.mock.calls[0][0]).toMatch('> foo');
            });
        });
    });
});

describe('withValidation', () => {
    const { withValidation } = withRest;

    it('should validate request body', async () => {
        const schema = {
            body: Joi.object({
                foo: Joi.valid('bar').required(),
            }),
        };

        const app = withRest({
            POST: withValidation(schema)((req) => req.body),
        });

        await request(enhance(app))
        .post('/')
        .send({})
        .expect(400)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toEqual({
                statusCode: 400,
                error: 'Bad Request',
                message: '"body.foo" is required',
            });
        });
    });

    it('should validate request query', async () => {
        const schema = {
            query: Joi.object({
                foo: Joi.valid('bar').required(),
            }),
        };

        const app = withRest({
            GET: withValidation(schema)(() => ({ hello: 'world' })),
        });

        await request(enhance(app))
        .get('/')
        .expect(400)
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body).toEqual({
                statusCode: 400,
                error: 'Bad Request',
                message: '"query.foo" is required',
            });
        });
    });

    it('should validate request headers', async () => {
        const schema = {
            headers: Joi.object({
                'content-type':
                    Joi
                    .string()
                    .pattern(/^application\/json\b/)
                    .required(),
            }),
        };

        const app = withRest({
            POST: withValidation(schema)((req) => req.body),
        });

        await request(enhance(app))
        .post('/')
        .send('foo')
        .set('Content-Type', 'text/plain')
        .expect(400)
        .then((res) => {
            expect(res.body).toEqual({
                statusCode: 400,
                error: 'Bad Request',
                message: '"headers.content-type" with value "text/plain" fails to match the required pattern: /^application\\/json\\b/',
            });
        });
    });

    it('should copy validation result (normalization)', async () => {
        const schema = {
            query: Joi.object({
                foo: Joi.string().trim(),
            }),
            body: Joi.object({
                foo: Joi.string().trim(),
            }),
            headers: Joi.object({
                'x-foo': Joi.string().trim(),
            }).unknown(true),
        };

        const app = withRest({
            POST: withValidation(schema)((req) => ({
                query: req.query,
                body: req.body,
                headers: req.headers,
            })),
        });

        await request(enhance(app))
        .post('/')
        .query({ foo: 'first ' })
        .send({ foo: 'second ' })
        .set('X-Foo', 'third ')
        .expect('Content-Type', /^application\/json/)
        .then((res) => {
            expect(res.body.query).toEqual({ foo: 'first' });
            expect(res.body.body).toEqual({ foo: 'second' });
            expect(res.body.headers).toMatchObject({ 'x-foo': 'third' });
        });
    });
});

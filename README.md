# next-rest-api

[![NPM version][npm-image]][npm-url] [![Downloads][downloads-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Coverage Status][codecov-image]][codecov-url] [![Dependency status][david-dm-image]][david-dm-url] [![Dev Dependency status][david-dm-dev-image]][david-dm-dev-url]

[npm-url]:https://npmjs.org/package/@moxy/next-rest-api
[downloads-image]:https://img.shields.io/npm/dm/@moxy/next-rest-api.svg
[npm-image]:https://img.shields.io/npm/v/@moxy/next-rest-api.svg
[travis-url]:https://travis-ci.org/moxystudio/next-rest-api
[travis-image]:https://img.shields.io/travis/moxystudio/next-rest-api/master.svg
[codecov-url]:https://codecov.io/gh/moxystudio/next-rest-api
[codecov-image]:https://img.shields.io/codecov/c/github/moxystudio/next-rest-api/master.svg
[david-dm-url]:https://david-dm.org/moxystudio/next-rest-api
[david-dm-image]:https://img.shields.io/david/moxystudio/next-rest-api.svg
[david-dm-dev-url]:https://david-dm.org/moxystudio/next-rest-api?type=dev
[david-dm-dev-image]:https://img.shields.io/david/dev/moxystudio/next-rest-api.svg

Library that makes it easier to develop REST APIs in [Next.js](https://nextjs.org/).

## Motivation

Next.js brought API routes support in v9, but you have to provide your own implementation of handling different HTTP methods, validation, error handling and so on. So in short, this library provides:

- A standard way to detect HTTP methods (GET, POST, PUT, PATCH, DELETE, etc).
- A standard way to validate the request (headers, query, body).
- A standard way to deal with errors, including their responses.
- A standard way to log errors to `stderr`.

## Installation

```sh
$ npm install --save @moxy/next-rest-api @hapi/joi @hapi/boom
```

This library has a peer-dependency on [`@hapi/joi`](https://github.com/hapijs/joi) and [`@hapi/boom`](https://github.com/hapijs/boom) to perform validation and to output errors in a standard format.

## Usage

### Simple get endpoint:

In `/pages/api/products.js` (or `/pages/api/products/index.js`)

```js
import withRest from '@moxy/next-rest-api';

export default withRest({
    GET: async (req, res) => {
        const products = await listProducts();

        return products;
    },
});
```

## Simple get & post endpoint, with validation:

In `/pages/api/products.js` (or `/pages/api/products/index.js`)

```js
import withRest, { withValidation } from '@moxy/next-rest-api';
import Joi from '@hapi/joi';
import Boom from '@hapi/boom';

const getSchema = {
    query: Joi.object({
        q: Joi.string(),
        sortBy: Joi.valid('price:asc', 'price:desc'),
    });
};

const postSchema = {
    body: Joi.object({
        name: Joi.string().max(200).required(),
        description: Joi.string().max(2000),
        price: Joi.number().min(0).required(),
    });
};

export default withRest({
    GET: withValidation(getSchema)(async (req, res) => {
        const products = await listProducts(req.query);

        return products;
    }),
    POST: withValidation(postSchema)(async (req, res) => {
        const product = await createProduct(req.body);

        return product;
    },
});
```

ℹ️ You may use [`p-pipe`](https://github.com/sindresorhus/p-pipe) to compose your "middlewares" to be more readable, like so:

```js
export default withRest({
    GET: pPipe(
        withValidation(getSchema),
        async (req, res) => {
            const products = await listProducts(req.query);

            return products;
        },
    ),
});
```

### Simple get, put and delete endpoints, with validation:

In `/pages/api/products/[id].js`

ℹ️ In Next.js, dynamic parameters are assigned to the request query (`req.query.id` in this case).

```js
import withRest, { withValidation } from '@moxy/next-rest-api';
import Joi from '@hapi/joi';
import Boom from '@hapi/boom';

const getSchema = {
    query: Joi.object({
        id: Joi.string().required(),
    }),
};


const putSchema = {
    query: Joi.object({
        id: Joi.string().required(),
    }),
    body: Joi.object({
        name: Joi.string().max(200).required(),
        description: Joi.string().max(2000),
        price: Joi.number().min(0).required(),
    }),
};

const deleteSchema = getSchema;

export default withRest({
    GET: withValidation(getSchema)(async (req, res) => {
        let product;

        try {
            product = await getProduct(req.query.id);
        } catch (err) {
            if (err.code === 'NOT_FOUND') {
                throw Boom.notFound(`Product with id ${req.query.id} does not exist`);
            }

            throw err;
        }

        return product;
    }),
    PUT: withValidation(putSchema)(async (req, res) => {
        let product;

        try {
            product = await updateProduct(req.query.id, req.body);
        } catch (err) {
            if (err.code === 'NOT_FOUND') {
                throw Boom.notFound(`Product with id ${req.query.id} does not exist`);
            }

            throw err;
        }

        return product;
    }),
    DELETE: withValidation(deleteSchema)(async (req, res) => {
        try {
            product = await deleteProduct(req.query.id);
        } catch (err) {
            if (err.code === 'NOT_FOUND') {
                return;
            }

            throw err;
        }
    },
});
```

ℹ️ A lot of schemas in the above examples are being repeated. To keep things DRY, it's advisable to reuse them, perhaps in a `schemas.js` file.

## API

### withRest(methods, [options])

Matches handlers defined in `methods` against the HTTP method, like `get` or `post`.

Handlers may return any valid JSON as per the [RFC7159](https://tools.ietf.org/html/rfc7159), which includes objects, arrays, booleans and null. The return value will be sent automatically as a JSON response.

Exceptions thrown within handlers will be caught automatically and sent to the client. You may either throw a [Boom](https://github.com/hapijs/boom) error or a standard error object. If a standard error object is thrown, it will be converted to a Boom error instance automatically (`500`).

#### methods

Type: `object`

An object where keys are HTTP methods (uppercase) and values are the handlers with the signature `async (req, res) => {}`.

#### options

Type: `object`

> ℹ️ You may pass any of the supported `react-intl`'s [`<IntlProvider>`](https://github.com/formatjs/react-intl/blob/master/docs/Components.md#intlprovider) props as well, except for `locale` and `messages`.

##### sendError

Type: `function`   
Default: *see `defaultSendError` in [index.js](index.js)*

A function to send Boom errors back to the client. Has the following signature: `(res, err) => {}`.

##### logError

Type: `function`   
Default: *see `defaultLogError` in [index.js](index.js)*

A function to log errors. Has the following signature: `(err) => {}`.

### withValidation(schemas)

Wraps a handler with validation against [Joi](https://github.com/hapijs/joi) schemas.

If validation fails, the response will sent back to the client will be `400 Bad Request`.

#### schemas

Type: `object`

An object with `query`, `body` or `headers` keys and their associated Joi schemas. Each of these schemas will be matched against the incoming request.

⚠️ Generally you only want to validate a subset of headers. In such situations, your `headers` schema should allow unknown keys with `.unknown(true)`.

## How to test your API

To test your API, we recommend using [`supertest`](https://github.com/visionmedia/supertest).

However, we have to inject Next.js helpers into `req` and `res` ourselves like so:

```js
// pages/api/hello.js
import withRest from '@moxy/next-rest-api';

export default withRest()({
    get: () => 'hello',
});
```

```js
// pages/api/hello.test.js
const { apiResolver } = require('next/dist/next-server/server/api-utils');
const hello = require('./hello');

const enhance = (handler) => (req, res) => apiResolver(req, res, undefined, handler);

it('should print hello', async () => {
    await request(enhance(hello))
        .get('/')
        .expect(200)
        .then((res) => {
            expect(res.body).toBe('hello');
        });
});
```

## Tests

```sh
$ npm t
$ npm t -- --watch  # To run watch mode
```

## License

Released under the [MIT License](https://opensource.org/licenses/mit-license.php).

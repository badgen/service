import millify from 'millify'
import got from '../libs/got'
import { getDockerAuthToken, getDockerFatManifest, getDockerImageManifest } from '../libs/docker'
import { createBadgenHandler, PathArgs } from '../libs/create-badgen-handler'

export default createBadgenHandler({
  title: 'Docker',
  examples: {
    '/docker/pulls/library/ubuntu': 'pulls (library)',
    '/docker/stars/library/ubuntu': 'stars (library)',
    '/docker/size/library/ubuntu': 'size (library)',
    '/docker/pulls/amio/node-chrome': 'pulls (scoped)',
    '/docker/stars/library/mongo?icon=docker&label=stars': 'stars (icon & label)',
    '/docker/size/lukechilds/bitcoind/latest/amd64': 'size (scoped/tag/architecture)',
    '/docker/size/lucashalbert/curl/latest/arm/v6': 'size (scoped/tag/architecture/variant)',
    '/docker/layers/lucashalbert/curl/latest/arm/v6': 'layers (scoped/tag/architecture/variant)',
  },
  handlers: {
    '/docker/:topic<stars|pulls>/:scope/:name': starPullHandler,
    '/docker/size/:scope/:name/:tag?/:architecture?/:variant?': sizeHandler,
    '/docker/layers/:scope/:name/:tag?/:architecture?/:variant?': layersHandler,
  }
})

async function starPullHandler ({ topic, scope, name }: PathArgs) {
  if (!['stars', 'pulls'].includes(topic)) {
    return {
      subject: 'docker',
      status: 'unknown topic',
      color: 'grey'
    }
  }

  /* eslint-disable camelcase */
  const endpoint = `https://hub.docker.com/v2/repositories/${scope}/${name}`
  const { pull_count, star_count } = await got(endpoint).json<any>()

  switch (topic) {
    case 'stars':
      return {
        subject: 'docker stars',
        status: millify(star_count),
        color: 'blue'
      }
    case 'pulls':
      return {
        subject: 'docker pulls',
        status: millify(pull_count),
        color: 'blue'
      }
  }
}

async function sizeHandler ({ scope, name, tag, architecture, variant }: PathArgs) {
  tag = tag ? tag : 'latest'
  architecture = architecture ? architecture : 'amd64'
  variant = variant ? variant : ''
  /* eslint-disable camelcase */
  const endpoint = `https://hub.docker.com/v2/repositories/${scope}/${name}/tags`
  let body = await got(endpoint).json<any>()

  let results = [...body.results]
  while (body.next) {
    body = await got(body.next).json<any>()
    results = [...results, ...body.results]
  }

  const tagData = results.find(tagData => tagData.name === tag)

  if (!tagData) {
    return {
      subject: 'docker',
      status: 'unknown tag',
      color: 'grey'
    }
  }

  let imageData = tagData.images.find(image => image.architecture === architecture)

  if (!imageData) {
    return {
      subject: 'docker',
      status: 'unknown architecture',
      color: 'grey'
    }
  }

  if (variant) {
    imageData = tagData.images.filter(image => image.architecture === architecture).find(image => image.variant === variant)

    if (!imageData) {
      return {
        subject: 'docker',
        status: 'unknown variant',
        color: 'grey'
      }
    }
  }

  const sizeInMegabytes = (imageData.size / 1024 / 1024).toFixed(2)

  return {
    subject: 'docker image size',
    status: `${sizeInMegabytes} MB`,
    color: 'blue'
  }
}

async function layersHandler ({ scope, name, tag, architecture, variant }: PathArgs) {
  tag = tag ? tag : 'latest'
  architecture = architecture ? architecture : 'amd64'
  variant = variant ? variant : ''

  const token = (await getDockerAuthToken(scope, name)).token
  if (! token) {
    return {
      subject: 'docker layers',
      status: 'unknown image',
      color: 'grey'
    }
  }

  const manifests = (await getDockerFatManifest(scope, name, tag, token)).manifests
  
  if (! manifests) {
    return {
      subject: 'docker layers',
      status: 'unknown tag',
      color: 'grey'
    }
  }

  let manifest = manifests.find(manifests => manifests.platform.architecture === architecture)

  if (! manifest) {
    return {
      subject: 'docker layers',
      status: 'unknown architecture',
      color: 'grey'
    }
  }

  if (variant) {
    manifest = manifests.filter(manifests => manifests.platform.architecture === architecture).find(manifests => manifests.platform.variant === variant)

    if (! manifest) {
      return {
        subject: 'docker layers',
        status: 'unknown variant',
        color: 'grey'
      }
    }
  }

  const digest = manifest.digest

  const layers = (await getDockerImageManifest(scope, name, digest, token)).layers

  if (! layers) {
    return {
      subject: 'docker layers',
      status: 'error getting layers',
      color: 'grey'
    }
  }

  return {
    subject: 'docker layers',
    status: `${layers.length}`,
    color: 'blue'
  }
}
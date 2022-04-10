'use strict'

const { MemoryFile } = require('./file')
const fs = require('fs')
const cheerio = require('cheerio')
const { run } = require('spectaql')
const expandPath = require('@antora/expand-path-helper')
const ospath = require('path')
const { posix: path } = ospath
const mimeTypes = require('mime-types')

const update = (element, id, name) => {
  element.attr('id', id)
  element.html(`<a class="anchor" href="#${id}" />`)
  element.append(name)
}

const updateHref = (element, id, href, name) => {
  element.attr('id', id)
  element.html(`<a class="anchor" href="#${href}" />`)
  element.append(name)
}

module.exports.register = (pipeline) => {
  const descriptorMap = {}

  pipeline.on('contentAggregated', ({ contentAggregate }) => {
    contentAggregate.forEach((descriptor) => {
      // map the component and version
      const map = {
        component: descriptor.name,
        version: descriptor.version,
        displayVersion: descriptor.displayVersion != null ? descriptor.displayVersion : descriptor.version,
      }
      // for each file
      for (const it of descriptor.files) {
        const memfile = new MemoryFile(it)

        // find the current module and topic
        const pathMatch = memfile.path.match(new RegExp('modules\\/(\\w*)\\/(\\w*).*.adoc'))
        if (pathMatch == null) {
          continue
        }
        map.module = pathMatch[1]
        map.topic = pathMatch[2]
        if (map.topic == null || map.topic !== 'pages') {
          continue
        }

        const content = memfile.contents.toString()

        // check if the page contains the spectaql layout
        const layoutMatch = content.match(new RegExp(':page-layout: spectaql-ui'))
        if (layoutMatch == null) {
          continue
        }

        // check if the page includes a spectaql config file attachment
        const configFile = content.match(new RegExp('include.*attachment\\$(.*)\\[]'))
        if (configFile == null) {
          continue
        }
        map.configFile = configFile[1]
        // get the name to use for the graphql html file.
        const filePart = map.configFile.match(new RegExp('(.*)-config.yml'))
        if (filePart != null) {
          map.targetName = filePart[1]
          map.targetFile = `${map.targetName}-graphql.html`

          // add it to the global map
          descriptorMap[memfile.path] = map
        }
      }
    })
  })

  pipeline.on('contentClassified', async ({ contentCatalog }) => {
    // for each file
    for (const it of contentCatalog.getFiles()) {
      const memfile = new MemoryFile(it)

      // check if a config exists for this file
      const configMap = descriptorMap[memfile.path]
      if (configMap === undefined) {
        continue
      }

      // get the file path and target file
      const filePath = expandPath(`${configMap.component}/modules/${configMap.module}/attachments/${configMap.configFile}`, { dot: '~+' })
      const targetFile = `${configMap.component}-${configMap.module}-${configMap.targetFile}`

      // set the spectaql options
      const options = {
        specFile: filePath,
        embeddable: true,
        targetFile: targetFile,
        disableCss: true,
        disableJs: true,
        quiet: true,
      }

      await new Promise((resolve) => {
        // execute spectaql run command with given options
        run(options).then(() => {
          // get the output file
          const data = fs.readFileSync(`public/${targetFile}`, 'utf8')

          // load data into cheerio
          const $ = cheerio.load(data)

          // add an anchor to each field argument header
          $('.field-arguments-heading').each((i, elem) => {
            const row = $(elem).closest('.row-field-arguments')
            const prevRow = $(row).prev().find('.property-name').children('code').html()
            const name = $(elem).html()
            update($(elem), `${prevRow}-${name.toLowerCase()}-${i}`, `${prevRow} ${name}`)
          })

          // add an anchor to each field definition property header
          $('.definition-properties').each((i, elem) => {
            const header = $(elem).find('h5')
            const section = $(elem).closest('section').find('.definition-heading').html()
            const name = $(header).html()
            $(header).html(`${section} ${name}`)
          })

          // add an anchor to each operation's argument and response header
          $('.operation-arguments, .operation-response, .operation-query-example, .operation-variables-example, .operation-response-example')
            .each((i, elem) => {
              const child = $(elem).children('h5')
              const section = $(elem).closest('section').find('.operation-heading').find('code').html()
              const name = $(child).html()
              update($(child), `${section}-${name.toLowerCase()}-${i}`, `${section} ${name}`)
            })

          // add am anchor to each example heading
          $('.example-heading')
            .each((i, elem) => {
              const section = $(elem).closest('section').find('.operation-heading').find('code').html()
              const name = $(elem).html()
              update($(elem), `${section}-${name.toLowerCase()}-${i}`, `${section} ${name}`)
            })

          // add an anchor to each example section
          $('.example-section > h5')
            .each((i, elem) => {
              const section = $(elem).closest('section').find('.definition-heading').html()
              const name = $(elem).html()
              if (name === 'Example') {
                update($(elem), `${section}-${name.toLowerCase()}-${i}`, `${section} ${name}`)
              }
            })

          // add an anchor to each definition header
          $('.definition-heading').each((i, elem) => {
            const name = $(elem).html()
            updateHref($(elem), `definition-${name}-id`, `definition-${name}`, name)
          })

          // add an anchor to each group header
          $('.group-heading').each((i, elem) => {
            const name = $(elem).html()
            const id = $(elem).attr('id')
            updateHref($(elem), null, id, name)
          })

          // add an anchor to each operation header
          $('.operation-heading').each((i, elem) => {
            const child = $(elem).children('code')
            const name = $(child).html()
            updateHref($(elem), `${name}-id`, `query-${name}`, child)
          })

          // add an anchor to the doc heading
          $('.doc-heading').each((i, elem) => {
            const name = $(elem).html()
            update($(elem), 'doc-heading-id', name)
          })

          // extract the html
          const extract = $('#spectaql')
          const string = extract.html()

          // add the file to the content catalog
          contentCatalog.addFile({
            contents: Buffer.from(string),
            path: `modules/${configMap.module}/attachment/${targetFile}`,
            src: {
              component: configMap.component,
              version: configMap.version,
              displayVersion: configMap.displayVersion,
              module: configMap.module,
              family: 'attachment',
              relative: targetFile,
              basename: path.basename(targetFile),
              extname: path.extname(targetFile),
              stem: path.basename(targetFile, path.extname(targetFile)),
              mediaType: mimeTypes.lookup(path.extname(targetFile)),
            },
          })
          // remove the original file
          fs.unlinkSync(`public/${targetFile}`)

          // replace the orignal spectaql config file include to the graphql html file
          const newContent = memfile.contents.toString().replace(configMap.configFile, targetFile)
          it.contents = Buffer.from(newContent)

          // resolve the promise
          resolve()
        })
      })
    }
  })
}

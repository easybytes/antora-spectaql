'use strict'

const { promises: fsp } = require('fs')
const Asciidoctor = require('asciidoctor')
const docbookConverter = require('@asciidoctor/docbook-converter')
const pandoc = require('node-pandoc')

const README_SRC = 'README.adoc'
const README_HIDDEN = '.' + README_SRC
const README_DEST = 'README.md'

/**
 * Used asciidoctor to convert README.adoc to a docbook format, to be
 * parsed by pandoc into gfm (GitHub flavored markdown).
 */
async function writeMarkdown (asciidoc) {

  const asciidoctor = Asciidoctor()
  docbookConverter.register()

  const docbook = asciidoctor.convert(asciidoc, { backend: 'docbook', doctype: 'book', standalone: true })

  return await new Promise((resolve) => {

    const callback = function (err, result) {
      if (err) console.error(err);

      return resolve(result)
    };

    pandoc(docbook, `-f docbook -t gfm -o ${README_DEST}`, callback)
  })

}

/**
 * Transforms the AsciiDoc README (README.adoc) in the working directory into
 * Markdown format (README.md) and hides the AsciiDoc README (.README.adoc).
 */
;(async () => {
  const readmeSrc = await fsp.stat(README_SRC).then((stat) => (stat.isFile() ? README_SRC : README_HIDDEN))
  const writeP = fsp.readFile(readmeSrc, 'utf8').then((asciidoc) => writeMarkdown(asciidoc))
  const renameP = readmeSrc === README_SRC ? await fsp.rename(README_SRC, README_HIDDEN) : await Promise.resolve()
  await Promise.all([writeP, renameP])
})()

// REQUIRES FONCTION
const requires = paths => Object.entries(paths)?.map(folder => folder?.[1]?.map(path => require(`../routes/${folder?.[0]}/${path}/${path}`) ?? []))

// API ROUTES
const paths = {
  batch: [
    // BATCHS
    "create"
    // "update"
  ],
  document: [
    // DOCUMENTS
    "create"
  ]
  // project: []
}

const routes = requires(paths).flat()
module.exports = routes

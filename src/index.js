const app = require("./app")
const transaction = require("./services/transactions")

// CONNECT DATABASE
transaction("Uploader")

// LISTEN APP
app.listen(3000, () => console.log("Uploader listening on port 3000!"))

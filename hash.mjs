import bcrypt from "bcryptjs";
console.log(bcrypt.hashSync(process.argv[2], 10));
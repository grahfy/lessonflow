import bcrypt from 'bcryptjs';
console.log(bcrypt.compareSync('admin123', '$2b$12$.nSivq0bXmOy51mcwKwFuel5qWyeDGBc3X/45mOOdsiWYYhoxaIHy'));
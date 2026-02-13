const express = require('express');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 
const bodyParser = require('body-parser');
const fs = require('fs'); // Módulo para manejar archivos
const app = express();
const PORT = 3000;
const SECRET = "secreto_sisifo_2026";

app.use(bodyParser.json());
app.use(express.static('public'));

// FUNCIONES DE PERSISTENCIA
const leerArchivo = (nombre) => JSON.parse(fs.readFileSync(`./data/${nombre}.json`, 'utf-8'));
const guardarArchivo = (nombre, datos) => fs.writeFileSync(`./data/${nombre}.json`, JSON.stringify(datos, null, 2));

// REGISTRO Y LOGIN ---
app.post('/register', async (req, res) => {
    const { nombre, email, password, nivel } = req.body;
    const usuarios = leerArchivo('usuarios');
    
    //  Encriptar clave 
    const hashedPassword = await bcrypt.hash(password, 10);
    usuarios.push({ nombre, email, password: hashedPassword, nivel });
    
    guardarArchivo('usuarios', usuarios);
    res.status(201).send("Usuario registrado");
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const usuarios = leerArchivo('usuarios');
    const user = usuarios.find(u => u.email === email);
    
    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ email: user.email, nivel: user.nivel }, SECRET); 
        return res.json({ token, nivel: user.nivel });
    }
    res.status(401).send("Credenciales inválidas");
});

// Middleware de Protección 
const auth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).send("Token requerido");
    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) return res.status(401).send("Token inválido");
        req.user = decoded;
        next();
    });
};

//  PRODUCTOS 
app.post('/products', auth, (req, res) => {
    if (req.user.nivel !== 'admin') return res.status(403).send("Solo admin"); 
    const { nombre, codigo, precio, descripcion } = req.body; 
    
    if (parseFloat(precio) <= 0) return res.status(400).send("Precio debe ser > 0"); 
    
    const productos = leerArchivo('productos');
    productos.push({ nombre, codigo, precio: parseFloat(precio), descripcion });
    guardarArchivo('productos', productos);
    res.status(201).send("Producto creado");
});

app.get('/products', (req, res) => { 
    res.json(leerArchivo('productos'));
});

//  Carrito Simple - Agregar productos
app.post('/cart', auth, (req, res) => {
    const { codigo } = req.body;
    const productos = leerArchivo('productos');
    const prod = productos.find(p => String(p.codigo) === String(codigo)); // Comparación segura
    
    if (!prod) return res.status(404).send("Producto no encontrado en inventario");
    
    const carritos = leerArchivo('carritos');
    // Si el usuario no tiene carrito, creamos uno nuevo 
    if (!carritos[req.user.email]) {
        carritos[req.user.email] = [];
    }
    
    carritos[req.user.email].push(prod);
    guardarArchivo('carritos', carritos); // Persistencia en JSON
    
    res.status(200).json({ mensaje: "Agregado", cantidad: carritos[req.user.email].length });
});

app.get('/cart', auth, (req, res) => {
    const carritos = leerArchivo('carritos');
    const miCarrito = carritos[req.user.email] || [];
    
    // Calculamos el total sumando los precios de la "base de datos"
    const total = miCarrito.reduce((suma, p) => suma + parseFloat(p.precio), 0);
    
    res.json({ 
        productos: miCarrito, 
        total: total 
    });
});

app.delete('/cart', auth, (req, res) => { 
    const carritos = leerArchivo('carritos');
    carritos[req.user.email] = [];
    guardarArchivo('carritos', carritos);
    res.send("Carrito vaciado");
});

app.get('/', (req, res) => res.redirect('/login.html'));

// ELIMINAR PRODUCTO 
app.delete('/products/:codigo', auth, (req, res) => {
    if (req.user.nivel !== 'admin') return res.status(403).send("No autorizado");
    
    let productos = leerArchivo('productos'); 
    const inicial = productos.length;
    productos = productos.filter(p => p.codigo !== req.params.codigo);
    
    if (productos.length === inicial) return res.status(404).send("No encontrado");
    
    guardarArchivo('productos', productos);
    res.send("Producto eliminado");
});

// Finalizar compra y guardar historial
app.post('/checkout', auth, (req, res) => {
    const carritos = leerArchivo('carritos');
    const miCarrito = carritos[req.user.email] || [];

    if (miCarrito.length === 0) return res.status(400).send("Carrito vacío");

    const compras = leerArchivo('compras'); 
    if (!compras[req.user.email]) compras[req.user.email] = [];

    const nuevaOrden = {
        id: Date.now(),
        fecha: new Date().toLocaleString(),
        productos: miCarrito,
        total: miCarrito.reduce((s, p) => s + parseFloat(p.precio), 0)
    };

    compras[req.user.email].push(nuevaOrden);
    guardarArchivo('compras', compras);

    // Limpiar carrito tras "pago" exitoso
    carritos[req.user.email] = [];
    guardarArchivo('carritos', carritos);

    res.status(201).json(nuevaOrden);
});

app.get('/history', auth, (req, res) => {
    const compras = leerArchivo('compras');
    res.json(compras[req.user.email] || []);
});
app.listen(PORT, () => console.log(`Servidor persistente en http://localhost:${PORT}`));
# Gazapo Link Relay SIO EXP

Plantilla experimental para desplegar un relay privado de Gazapo Link SIO EXP
en Cloudflare Workers. Utiliza el protocolo 9 y no sustituye al relay estable de
protocolo 8.

## Compatibilidad

- Aplicacion: Gazapo Link SIO EXP 0.6.0
- Protocolo: 9
- Arquitectura: una GBA por dispositivo; transacciones SIO por WebSocket
- Jugadores por sala: 2
- Runtime: Cloudflare Workers con Durable Objects SQLite

No conectes la aplicacion estable 0.5.22 a este relay. Tampoco conectes la
aplicacion SIO EXP al relay estable.

## Despliegue con un clic

Usa este boton para copiar la plantilla a tus propias cuentas de GitHub y
Cloudflare sin instalar programas:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gazapo-ai/gazapo-link-relay-sio-exp)

1. Pulsa `Deploy to Cloudflare`.
2. Inicia sesion en GitHub y Cloudflare.
3. Autoriza la conexion y elige un nombre para el proyecto.
4. Pulsa `Deploy` y espera el mensaje `Success`.
5. Copia la URL terminada en `.workers.dev`.

Cada despliegue pertenece a la cuenta de quien lo crea y utiliza su propia cuota
de Cloudflare.

## Comprobacion

Abre la URL entregada por Cloudflare. Debe responder:

```json
{"ok":true,"service":"gazapo-link-relay-sio-exp","protocol":9,"architecture":"one-core-per-device"}
```

Si no indica `protocol: 9`, no uses esa URL con la aplicacion experimental.

## Configuracion de los telefonos

Ambos jugadores deben:

1. Instalar exactamente la misma version de Gazapo Link SIO EXP.
2. Importar exactamente la misma ROM.
3. Abrir `Multijugador online > Servidor online`.
4. Pegar la misma URL completa del relay v9.
5. Usar tag-names diferentes.

## Desarrollo local opcional

```text
npm install
npm test
npm run check
npm run deploy
```

## Privacidad

El relay reenvia identificadores tecnicos, metadatos de ROM y transacciones del
puerto SIO entre los dos participantes. Esta implementacion no guarda esos datos
de forma permanente. El propietario del despliegue controla su Worker y su cuenta
de Cloudflare.

## Licencia

MIT. Consulta `LICENSE`.

import readline from 'node:readline';

const mode = process.argv[2] ?? 'scroll';

function emit(line) {
  process.stdout.write(`${line}\n`);
}

function emitTtySize() {
  emit(`tty-size:${process.stdout.rows ?? 0}x${process.stdout.columns ?? 0}`);
}

function currentTtySize() {
  return `${process.stdout.rows ?? 0}x${process.stdout.columns ?? 0}`;
}

if (mode === 'scroll') {
  for (let index = 1; index <= 240; index += 1) {
    emit(`scroll-line-${String(index).padStart(3, '0')}`);
  }
  emit('scroll-ready');
} else if (mode === 'mouse') {
  process.stdout.write('\u001b[?1000h\u001b[?1006h');
  emit('mouse-ready');
} else if (mode === 'size') {
  let lastSize = currentTtySize();
  emitTtySize();
  const emitIfChanged = () => {
    const nextSize = currentTtySize();
    if (nextSize === lastSize) {
      return;
    }

    lastSize = nextSize;
    emitTtySize();
  };

  if (process.stdout.isTTY) {
    process.stdout.on('resize', emitIfChanged);
  }

  setInterval(emitIfChanged, 100);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  if (line.trim() === 'exit') {
    process.stdout.write('\u001b[?1000l\u001b[?1006l');
    process.exit(0);
  }

  emit(`stdin:${line}`);
});

process.stdin.on('data', (chunk) => {
  if (mode !== 'mouse') {
    return;
  }

  const hex = Buffer.from(chunk).toString('hex');
  emit(`mouse-bytes:${hex}`);
});

setInterval(() => {
  if (mode === 'scroll') {
    emit('tick-scroll');
  }
}, 5000);
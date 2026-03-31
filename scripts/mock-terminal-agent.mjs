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

function encodeHex(value) {
  return Buffer.from(value, 'latin1').toString('hex');
}

function isCprPrefix(value) {
  return /^\x1b?(?:\[(?:\d+(?:;\d*)?)?)?$/.test(value);
}

function runCprBurst() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.resume();

  const totalQueries = 24;
  const queryIntervalMs = 60;
  const pendingTimeoutMs = 1500;
  let completedQueries = 0;
  let awaitingReply = false;
  let pendingTimer = null;
  let buffer = '';

  const finish = (line, exitCode = 0) => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }

    emit(line);
    process.exit(exitCode);
  };

  const scheduleNextQuery = () => {
    if (completedQueries >= totalQueries) {
      finish(`cpr-burst-complete:${completedQueries}`);
      return;
    }

    setTimeout(() => {
      awaitingReply = true;
      process.stdout.write('\u001b[6n');
      pendingTimer = setTimeout(() => {
        finish(`cpr-timeout:${completedQueries + 1}`, 1);
      }, pendingTimeoutMs);
    }, queryIntervalMs);
  };

  const processBuffer = () => {
    for (;;) {
      const match = buffer.match(/^\u001b\[(\d+;\d+)R/);
      if (!match) {
        if (buffer.length > 0 && !isCprPrefix(buffer)) {
          finish(`cpr-invalid:${encodeHex(buffer)}`, 1);
        }
        return;
      }

      if (!awaitingReply) {
        finish(`cpr-duplicate:${encodeHex(buffer)}`, 1);
      }

      buffer = buffer.slice(match[0].length);
      awaitingReply = false;
      completedQueries += 1;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }

      emit(`cpr-ok:${completedQueries}:${match[1]}`);

      if (buffer.length > 0) {
        const nextMatch = buffer.match(/^\u001b\[(\d+;\d+)R/);
        if (nextMatch) {
          finish(`cpr-duplicate:${encodeHex(buffer)}`, 1);
        }

        if (!isCprPrefix(buffer)) {
          finish(`cpr-invalid:${encodeHex(buffer)}`, 1);
        }
      }

      scheduleNextQuery();
      return;
    }
  };

  emit('cpr-burst-start');

  process.stdin.on('data', (chunk) => {
    buffer += Buffer.from(chunk).toString('latin1');
    processBuffer();
  });

  scheduleNextQuery();
}

if (mode === 'scroll') {
  for (let index = 1; index <= 240; index += 1) {
    emit(`scroll-line-${String(index).padStart(3, '0')}`);
  }
  emit('scroll-ready');
} else if (mode === 'mouse') {
  process.stdout.write('\u001b[?1000h\u001b[?1006h');
  emit('mouse-ready');
} else if (mode === 'cpr') {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.resume();

  const timeout = setTimeout(() => {
    emit('cpr-timeout');
    process.exit(0);
  }, 5000);

  process.stdin.on('data', (chunk) => {
    clearTimeout(timeout);
    emit(`cpr-response:${Buffer.from(chunk).toString('hex')}`);
    process.exit(0);
  });

  process.stdout.write('\u001b[6n');
} else if (mode === 'cpr-burst') {
  runCprBurst();
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
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..');
const demoDir = join(repoRoot, 'docs/competition/submission_90plus/evidence/demo');
const sourceVideo = join(demoDir, 'office-demo.mp4');
const captions = join(demoDir, 'office-demo-submission.ass');
const outputVideo = join(demoDir, 'office-demo-submission.mp4');
const outputPoster = join(demoDir, 'office-demo-poster.jpg');
const frontendAssets = join(appRoot, 'apps/frontend/dist/assets');
const ffmpegExecutable = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobeExecutable = process.env.FFPROBE_PATH || 'ffprobe';
const pythonExecutable = process.env.PYTHON_PATH || 'python';

async function run(executable, args, options = {}) {
  const child = spawn(executable, args, {
    cwd: options.cwd || repoRoot,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout = `${stdout}${chunk}`.slice(-100_000);
  });
  child.stderr.on('data', chunk => {
    stderr = `${stderr}${chunk}`.slice(-100_000);
  });
  await new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', code => code === 0
      ? resolveExit()
      : rejectExit(new Error(`${executable} exited with ${code}\n${stderr}`)));
  });
  return { stdout, stderr };
}

async function findFontAsset(weight) {
  const files = await fs.readdir(frontendAssets);
  const matcher = new RegExp(`^noto-sans-sc-.*-${weight}-normal-.*\\.woff2$`);
  const name = files.find(file => matcher.test(file));
  if (!name) throw new Error(`Bundled Noto Sans SC ${weight} font was not found in ${frontendAssets}. Run npm run build first.`);
  return join(frontendAssets, name);
}

async function convertFont(source, target) {
  const code = [
    'import sys',
    'from fontTools.ttLib import TTFont',
    'font = TTFont(sys.argv[1])',
    'font.flavor = None',
    'font.save(sys.argv[2])',
  ].join('; ');
  await run(pythonExecutable, ['-c', code, source, target]);
}

await Promise.all([fs.access(sourceVideo), fs.access(captions)]);
const tempRoot = await fs.mkdtemp(join(os.tmpdir(), 'openprism-competition-video-'));

try {
  const regularFont = join(tempRoot, 'NotoSansSC-Regular.ttf');
  const semiboldFont = join(tempRoot, 'NotoSansSC-Semibold.ttf');
  await Promise.all([
    convertFont(await findFontAsset('400'), regularFont),
    convertFont(await findFontAsset('600'), semiboldFont),
  ]);

  const filter = [
    '[0:v]drawbox=x=0:y=0:w=iw:h=10:color=0x4f6ef7:t=fill,drawbox=x=170:y=680:w=1100:h=2:color=0x334155:t=fill,format=yuv420p[head]',
    '[1:v]fps=25,scale=1440:960:force_original_aspect_ratio=decrease,pad=1440:960:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[body]',
    '[2:v]drawbox=x=0:y=950:w=iw:h=10:color=0x4f6ef7:t=fill,drawbox=x=170:y=680:w=1100:h=2:color=0x334155:t=fill,format=yuv420p[tail]',
    '[head][body][tail]concat=n=3:v=1:a=0[base]',
    `[base]ass=filename=${captions}:fontsdir=${tempRoot}:original_size=1440x960[out]`,
  ].join(';');

  await run(ffmpegExecutable, [
    '-y', '-loglevel', 'warning',
    '-f', 'lavfi', '-t', '5', '-i', 'color=c=0x0b1220:s=1440x960:r=25',
    '-i', sourceVideo,
    '-f', 'lavfi', '-t', '7', '-i', 'color=c=0x0b1220:s=1440x960:r=25',
    '-filter_complex', filter,
    '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    outputVideo,
  ]);

  const probe = await run(ffprobeExecutable, [
    '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,pix_fmt',
    '-of', 'json', outputVideo,
  ]);
  const metadata = JSON.parse(probe.stdout);
  const duration = Number(metadata.format?.duration);
  const stream = metadata.streams?.[0];
  if (!Number.isFinite(duration) || duration <= 60 || duration >= 180) {
    throw new Error(`Submission video duration must be longer than 60 seconds and shorter than 180 seconds; received ${duration}.`);
  }
  if (stream?.codec_name !== 'h264' || stream.width !== 1440 || stream.height !== 960 || stream.pix_fmt !== 'yuv420p') {
    throw new Error(`Unexpected submission video format: ${JSON.stringify(stream)}`);
  }

  await run(ffmpegExecutable, [
    '-y', '-loglevel', 'error', '-ss', '72', '-i', outputVideo,
    '-frames:v', '1', '-q:v', '2', outputPoster,
  ]);

  process.stdout.write(`${outputVideo}\n`);
  process.stdout.write(`${outputPoster}\n`);
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

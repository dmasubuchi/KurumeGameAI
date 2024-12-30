/******************************************************
 * script.js
 *
 * 2D物理ジャンプ + 坂や複雑な床・壁
 * - マップを定義 (lineSegments で表現)
 * - 左右キーで移動、上キーでジャンプ
 * - 障害物1-3個をランダム生成
 * - 「リロード」ボタンで場所をリセット＆障害物再配置
 ******************************************************/

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const reloadBtn = document.getElementById("reload-btn");

// キー状態
let keyLeft = false;
let keyRight = false;
let keyUp = false;

// プレイヤー
let player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  width: 30,
  height: 30,
  mass: 1.0,
  onGround: false
};

// 障害物(ランダムで1～3個)
let obstacles = [];

// マップ: lineSegments (坂や床を線分で表現)
// 例: 2つの坂、1つの段差、みたいに複数の線分を定義
// [ { x1, y1, x2, y2 }, ... ]
let lineSegments = [
  // 床(左端から400pxまではやや上昇)
  { x1: 0, y1: 400, x2: 400, y2: 350 },
  // 床(そこから右端まで下がる)
  { x1: 400, y1: 350, x2: 800, y2: 400 },
  // 壁(左端)
  { x1: 0,  y1: 0,   x2: 0,   y2: 400 },
  // 壁(右端)
  { x1: 800, y1: 0, x2: 800, y2: 400 }
];

// 物理定数
const GRAVITY = 0.3;
const FRICTION = 0.9;
const MOVE_SPEED = 0.3;
const JUMP_SPEED = -8;
const BOUNCE_FACTOR = 0.3; // 衝突で速度が反転するときの係数(床,壁)

// ------------------------------
// キーボード処理
// ------------------------------
document.addEventListener("keydown", (e)=>{
  switch(e.key){
    case "ArrowLeft":
      keyLeft = true; break;
    case "ArrowRight":
      keyRight = true; break;
    case "ArrowUp":
      keyUp = true; break;
  }
});
document.addEventListener("keyup", (e)=>{
  switch(e.key){
    case "ArrowLeft":
      keyLeft = false; break;
    case "ArrowRight":
      keyRight = false; break;
    case "ArrowUp":
      keyUp = false; break;
  }
});

// ------------------------------
// 初期化、リロード
// ------------------------------
reloadBtn.addEventListener("click", ()=> {
  initGame();
});

window.addEventListener("load", ()=> {
  initGame();
  mainLoop();
});

function initGame() {
  // プレイヤーを適当な位置にランダム配置
  player.x = Math.random()*100 + 50; // 50~150
  player.y = 50;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;

  // 障害物を1~3個ランダムに生成
  obstacles = [];
  const obstacleCount = Math.floor(Math.random()*3) + 1; // 1..3
  for(let i=0; i<obstacleCount; i++){
    obstacles.push({
      x: Math.random()*(canvas.width-60)+30,
      y: Math.random()*100+200,
      vx: 0,
      vy: 0,
      width: 40,
      height: 40,
      mass: 1.5
    });
  }
}

// ------------------------------
// メインループ
// ------------------------------
function mainLoop() {
  updatePlayer();
  updateObstacles();
  drawScene();
  requestAnimationFrame(mainLoop);
}

// ------------------------------
// プレイヤー更新
// ------------------------------
function updatePlayer() {
  // 入力
  if(keyLeft){
    player.vx -= MOVE_SPEED;
  }
  if(keyRight){
    player.vx += MOVE_SPEED;
  }
  if(keyUp && player.onGround){
    player.vy = JUMP_SPEED;
    player.onGround = false;
  }

  // 重力
  player.vy += GRAVITY;
  // 減速
  player.vx *= FRICTION;

  // 移動
  player.x += player.vx;
  player.y += player.vy;

  // 壁にぶつからないようクリップ(簡易)
  if(player.x<0){
    player.x=0; 
    player.vx=-player.vx*BOUNCE_FACTOR;
  }
  if(player.x+player.width>canvas.width){
    player.x=canvas.width - player.width;
    player.vx=-player.vx*BOUNCE_FACTOR;
  }

  // lineSegmentsと衝突チェック
  player.onGround=false;
  checkCollisionLineSegments(player);

  // 障害物衝突
  for(let obs of obstacles){
    handleCollisionRect(player, obs);
  }
}

// ------------------------------
// 障害物更新
// ------------------------------
function updateObstacles() {
  for(let obs of obstacles){
    // 重力+減速
    obs.vy += GRAVITY;
    obs.vx *= FRICTION;
    obs.x += obs.vx;
    obs.y += obs.vy;

    // キャンバス端クリップ
    if(obs.x<0){
      obs.x=0;
      obs.vx=-obs.vx*BOUNCE_FACTOR;
    }
    if(obs.x+obs.width>canvas.width){
      obs.x=canvas.width-obs.width;
      obs.vx=-obs.vx*BOUNCE_FACTOR;
    }
    // lineSegments衝突(床,坂,壁)
    checkCollisionLineSegments(obs);

    // 障害物同士の衝突(省略) → 複数ある場合 handleCollisionRect(obs[i], obs[j]) ...
  }
}

// ------------------------------
// 線分(坂,壁)との衝突チェック(簡易)
// ------------------------------
function checkCollisionLineSegments(obj) {
  // 矩形の下辺または四辺で坂や壁と当たることを想定(簡易)
  // より正確には線分と矩形のintersectionを計算
  // ここでは床/壁だけを想定し、y座標より下(床)に潜らないなどで対処
  lineSegments.forEach(seg => {
    // bounding box で簡易判定
    const minX = Math.min(seg.x1, seg.x2);
    const maxX = Math.max(seg.x1, seg.x2);
    const minY = Math.min(seg.y1, seg.y2);
    const maxY = Math.max(seg.y1, seg.y2);

    // オブジェクトが seg の水平範囲内にあるか
    const centerX = obj.x + obj.width/2;
    // 垂直方向
    // ここでは「床として機能する」線分を想定 → y座標を補間して衝突

    // 線分の傾き
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    // tを0~1 とした時、X(t)=x1+dx*t, Y(t)=y1+dy*t
    // centerXがどのtかを逆算→ Yを求める
    // ただし dx=0(垂直壁)の可能性あるのでケース分け

    if(Math.abs(dx)<0.01) {
      // 垂直壁
      // x座標がseg.x1付近なら衝突として跳ね返す
      if(centerX>minX && centerX<maxX) {
        // boundingで Yも範囲内なら壁衝突
        // 単純に x位置を補正
        if(obj.x+obj.width > minX && obj.x<maxX) {
          // 左壁 or 右壁
          if(dx>0) {
            // 右壁
            obj.x = minX - obj.width;
          } else {
            // 左壁
            obj.x = maxX;
          }
          obj.vx = -obj.vx*BOUNCE_FACTOR;
        }
      }
    } else {
      // 傾斜床(または水平)
      // t = (centerX - x1) / dx
      let t = (centerX - seg.x1)/dx;
      // 0<= t <=1 の範囲内なら線上にある
      if(t>=0 && t<=1) {
        let lineY = seg.y1 + dy*t;
        // obj の下端 (y+height) が lineY より下にいかないよう補正
        if( (obj.y+obj.height) > lineY ) {
          // 上から潜った
          obj.y = lineY - obj.height;
          obj.vy = -obj.vy * BOUNCE_FACTOR;
          // 地面に立ったとみなせる場合は onGround = true
          if(obj===player) {
            player.onGround = true;
          }
        }
      }
    }
  });
}

// ------------------------------
// 障害物同士,またはプレイヤーと障害物の衝突
// ------------------------------
function handleCollisionRect(a,b) {
  if(!isRectColliding(a,b)) return;
  // 重なりを簡易的に解消
  const overlapX1 = (a.x + a.width) - b.x;
  const overlapX2 = (b.x + b.width) - a.x;
  const overlapY1 = (a.y + a.height) - b.y;
  const overlapY2 = (b.y + b.height) - a.y;

  const minXPen = Math.min(overlapX1, overlapX2);
  const minYPen = Math.min(overlapY1, overlapY2);

  if(minXPen < minYPen){
    // 水平方向に解消
    if(a.x < b.x) {
      a.x -= minXPen*0.5;
      b.x += minXPen*0.5;
    } else {
      a.x += minXPen*0.5;
      b.x -= minXPen*0.5;
    }
    // vx 反転
    let temp = a.vx;
    a.vx = -a.vx*BOUNCE_FACTOR;
    b.vx = -b.vx*BOUNCE_FACTOR;
  } else {
    // 垂直方向に解消
    if(a.y < b.y) {
      a.y -= minYPen*0.5;
      b.y += minYPen*0.5;
    } else {
      a.y += minYPen*0.5;
      b.y -= minYPen*0.5;
    }
    // vy 反転
    let temp = a.vy;
    a.vy = -a.vy*BOUNCE_FACTOR;
    b.vy = -b.vy*BOUNCE_FACTOR;
  }
}

// ------------------------------
// 矩形同士の衝突判定
// ------------------------------
function isRectColliding(r1,r2){
  if(r1.x+r1.width<r2.x) return false;
  if(r1.x>r2.x+r2.width) return false;
  if(r1.y+r1.height<r2.y) return false;
  if(r1.y>r2.y+r2.height) return false;
  return true;
}

// ------------------------------
// 描画
// ------------------------------
function drawScene(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // 線分(床や壁、坂)を可視化
  ctx.strokeStyle="black";
  ctx.lineWidth=2;
  lineSegments.forEach(seg=>{
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  });

  // プレイヤー
  ctx.fillStyle="blue";
  ctx.fillRect(player.x, player.y, player.width, player.height);

  // 障害物
  ctx.fillStyle="red";
  obstacles.forEach(obs=>{
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
  });
}

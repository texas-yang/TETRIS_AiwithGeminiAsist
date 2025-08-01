// DOM 요소 가져오기
const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-piece');
const holdCtx = holdCanvas.getContext('2d');
const scoreElem = document.getElementById('score');
const levelElem = document.getElementById('level');
const highScoreElem = document.getElementById('high-score');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const restartBtn = document.getElementById('restart-btn');
const soundBtn = document.getElementById('sound-btn');

// 게임 상수 정의
const COLS = 10; // 가로 칸 수
const ROWS = 20; // 세로 칸 수
const BLOCK_SIZE = 30; // PC 화면을 위한 기본 블록 크기
const GHOST_COLOR = 'rgba(255, 255, 255, 0.2)';

const DIFFICULTY_SETTINGS = {
    easy:   { initialInterval: 1000, speedUpPerLevel: 80 },
    normal: { initialInterval: 800,  speedUpPerLevel: 90 },
    hard:   { initialInterval: 600,  speedUpPerLevel: 100 }
};
const MIN_DROP_INTERVAL = 50; // ms, 블록이 떨어지는 최소 간격

// 블록 색상 테마 정의
const COLOR_THEMES = [
    // 1. 클래식
    { 'I': 'cyan', 'O': 'yellow', 'T': 'purple', 'S': 'green', 'Z': 'red', 'J': 'blue', 'L': 'orange' },
    // 2. 파스텔
    { 'I': '#77ddff', 'O': '#fdfd96', 'T': '#d9a7e0', 'S': '#b2f7b2', 'Z': '#ffb3ba', 'J': '#a2cffe', 'L': '#ffb347' },
    // 3. 숲
    { 'I': '#5f9ea0', 'O': '#f0e68c', 'T': '#8b4513', 'S': '#2e8b57', 'Z': '#9acd32', 'J': '#4682b4', 'L': '#d2691e' },
    // 4. 바다
    { 'I': '#add8e6', 'O': '#ffffe0', 'T': '#483d8b', 'S': '#20b2aa', 'Z': '#00ced1', 'J': '#1e90ff', 'L': '#6495ed' },
    // 5. 흑백
    { 'I': '#f0f0f0', 'O': '#e0e0e0', 'T': '#d0d0d0', 'S': '#c0c0c0', 'Z': '#b0b0b0', 'J': '#a0a0a0', 'L': '#909090' }
];

// 테트로미노 (블록) 모양 정의
const PIECES = {
    'I': [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    'O': [
        [1, 1],
        [1, 1]
    ],
    'T': [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    'S': [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
    ],
    'Z': [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
    ],
    'J': [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    'L': [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
    ]
};

// --- 게임 상태 변수 ---
let board;
let player;
let pieceBag; // 7-Bag 시스템을 위한 블록 가방
let nextPieceType;
let heldPieceType;
let canHold;
let score;
let isAnimating;
let isPaused;
let level;
let lines;
let highScore;
let dropCounter;
let dropInterval;
let lastTime;
let isBackToBack; // Back-to-Back 보너스 상태 추적
let lastMoveWasRotate; // T-Spin 감지를 위해 마지막 행동이 회전이었는지 추적
let comboCounter; // 콤보 카운터
let animationFrameId;
let currentDifficulty; // 현재 난이도 설정
let currentColors; // 현재 활성화된 색상 테마
let isGameOver; // 게임 오버 상태를 추적하는 변수
let isSoundOn; // 사운드 ON/OFF 상태

const playerInitialState = {
    pos: { x: 0, y: 0 },
    matrix: null,
    color: null,
    type: null,
};

/**
 * ROWS x COLS 크기의 2차원 배열을 생성하고 0으로 채웁니다.
 * @returns {Array<Array<number>>} 게임 보드
 */
function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

/**
 * 현재 플레이어 블록과 보드의 충돌을 감지합니다.
 * @param {Array<Array<number>>} board - 게임 보드
 * @param {object} player - 플레이어 객체
 * @returns {boolean} 충돌 시 true 반환
 */
function collide(board, player) {
    const { matrix, pos } = player;
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            if (matrix[y][x] !== 0) { // 1. 블록의 실제 부분인지 확인
                let newY = y + pos.y;
                let newX = x + pos.x;

                // 2. 벽과의 충돌 확인 (상하좌우 경계)
                if (newY >= ROWS || newX < 0 || newX >= COLS) {
                    return true;
                }
                // 3. 다른 블록과의 충돌 확인
                if (board[newY] && board[newY][newX] !== 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * 캔버스를 지우고 보드와 플레이어 블록을 그립니다.
 */
function draw() {
    // 메인 보드 그리기
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(board, { x: 0, y: 0 }); // 고정된 블록들 그리기

    // 고스트 피스 그리기
    drawGhostPiece();
    drawMatrix(player.matrix, player.pos, player.color); // 움직이는 블록 그리기

}

/**
 * 주어진 행렬(블록 또는 보드)을 캔버스에 그립니다.
 * @param {Array<Array<number|string>>} matrix - 그릴 대상 행렬
 * @param {{x: number, y: number}} offset - 그릴 위치 오프셋
 * @param {string} [colorOverride] - 블록 색상 (제공 시 이 색상으로 덮어씀)
 */
function drawMatrix(matrix, offset, colorOverride = null) {
    const drawCtx = colorOverride === GHOST_COLOR ? ctx : this.ctx || ctx; // Allow drawing on different contexts

    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                // 보드에 저장된 값(블록 타입)을 기반으로 현재 테마에서 색상을 찾습니다.
                // 플레이어 블록은 colorOverride를 사용합니다.
                drawCtx.fillStyle = colorOverride || currentColors[value];
                drawCtx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            }
        });
    });
}

/**
 * 플레이어 블록을 보드에 병합하여 고정시킵니다.
 */
function merge() {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                // 보드에 색상 대신 블록의 타입('T', 'I' 등)을 저장합니다.
                board[y + player.pos.y][x + player.pos.x] = player.type;
            }
        });
    });
    canHold = true; // 블록을 고정시킨 후에는 홀드 가능
}

/**
 * 플레이어 블록을 아래로 한 칸 내립니다. 충돌 시 블록을 고정하고 새 블록을 생성합니다.
 */
function playerDrop() {
    if (isAnimating) return;
    if (isPaused) return;

    player.pos.y++; // 일단 한 칸 내립니다.

    if (collide(board, player)) {
        player.pos.y--; // 충돌했으므로 다시 올립니다.
        lockPieceAndReset(); // 블록 고정 및 다음 블록 준비
    }
    dropCounter = 0;
    lastMoveWasRotate = false;
}

/**
 * 플레이어 블록을 좌우로 이동시킵니다.
 * @param {number} dir - 이동 방향 (-1: 왼쪽, 1: 오른쪽)
 */
function playerMove(dir) {
    if (isAnimating) return;
    player.pos.x += dir;
    lastMoveWasRotate = false;
    playSound('move');
    if (collide(board, player)) {
        player.pos.x -= dir;
    }
}

/**
 * 7-Bag 시스템을 위해 블록 가방을 섞고 다시 채웁니다.
 */
function refillPieceBag() {
    const pieces = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    // Fisher-Yates 셔플 알고리즘으로 블록 순서를 섞습니다.
    for (let i = pieces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    pieceBag = pieces;
}


/**
 * 새 블록을 생성하고 위치를 초기화합니다. 게임오버를 체크합니다.
 */
function playerReset() {
    player.type = nextPieceType;
    player.matrix = PIECES[player.type];
    // 현재 활성화된 테마에서 색상을 가져옵니다.
    player.color = currentColors[player.type];
    player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);

    // 블록이 실제로 시작하는 y 위치를 보정합니다.
    // I 블록처럼 상단에 빈 줄이 있는 경우, y=0에서 시작하면 게임오버 감지를 못하는 문제를 해결합니다.
    player.pos.y = 0;
    let topRow = 0;
    while (topRow < player.matrix.length && player.matrix[topRow].every(v => v === 0)) {
        topRow++;
    }
    player.pos.y -= topRow;

    // 7-Bag 시스템에서 다음 블록을 가져옵니다.
    if (pieceBag.length === 0) {
        refillPieceBag();
    }
    nextPieceType = pieceBag.pop();

    drawNextPiece();

    if (collide(board, player)) {
        handleGameOver();
    }
}

/**
 * 블록을 한번에 바닥으로 내립니다 (Hard Drop).
 */
function playerHardDrop() {
    if (isAnimating) return;
    if (isPaused) return;
    while (!collide(board, player)) {
        player.pos.y++;
    }
    player.pos.y--;
    lockPieceAndReset();
    lastMoveWasRotate = false;
}

/**
 * 블록을 고정하고, 라인을 지우고, 점수를 업데이트하고, 새 블록을 생성합니다.
 */
function lockPieceAndReset() {
    // "Block Out" 게임 오버 조건을 확인합니다.
    let isTSpin = false;
    // T-Spin은 T 블록이 회전하여 고정될 때만 인정됩니다.
    if (player.type === 'T' && lastMoveWasRotate) {
        isTSpin = checkForTSpin(board, player);
    }
    lastMoveWasRotate = false; // 다음 블록을 위해 초기화

    // 이 검사는 merge() 전에 수행되어야 합니다.
    // 조각이 보드 상단(보이는 영역 밖)에 고정되면 게임 오버입니다.
    for (let y = 0; y < player.matrix.length; y++) {
        for (let x = 0; x < player.matrix[y].length; x++) {
            if (player.matrix[y][x] !== 0) { // 블록의 실제 부분인지 확인
                // 블록의 일부라도 보이는 영역 위(y < 0)에서 고정되면 게임 오버
                if ((y + player.pos.y) < 0) {
                    handleGameOver();
                    return;
                }
            }
        }
    }

    playSound('lock'); // 블록이 고정되는 시점에 항상 사운드를 재생합니다.

    merge(); // 1. 현재 조각을 보드에 먼저 합칩니다.
    sweepBoard(isTSpin);
}

/**
 * 완성된 라인을 찾아 애니메이션을 실행하거나, 다음 블록을 생성합니다.
 */
function sweepBoard(isTSpin = false) {
    // 2. 보드에 합쳐진 상태에서 완성된 줄이 있는지 찾습니다.
    let rowsToClear = [];
    outer: for (let y = board.length - 1; y >= 0; --y) {
        for (let x = 0; x < board[y].length; ++x) {
            if (board[y][x] === 0) {
                continue outer;
            }
        }
        rowsToClear.push(y);
    }

    // 3. 지울 줄이 있으면 애니메이션을, 없으면 다음 게임 단계를 진행합니다.
    if (rowsToClear.length > 0) {
        comboCounter++; // 콤보 카운트 증가
        animateAndClearLines(rowsToClear, isTSpin);
    } else {
        comboCounter = 0; // 라인 클리어 실패 시 콤보 초기화
        if (isTSpin) { // 라인 클리어 없는 T-Spin (Mini T-Spin)
            score += 100 * level; // T-Spin Mini 점수
            showFloatingText('T-Spin!');
        }
        playerReset();
        updateScoreAndLevel();
        dropCounter = 0;
    }
}

/**
 * 라인 제거 애니메이션을 실행하고, 완료 후 라인을 제거합니다.
 * @param {Array<number>} rows - 제거할 라인의 인덱스 배열
 */
function animateAndClearLines(rows, isTSpin) {
    const clearedLines = rows.length; // 점수 계산과 애니메이션 모두에 사용하므로 맨 위로 이동

    isAnimating = true;
    playSound('clear');

    // --- 폭발 애니메이션 추가 ---
    if (clearedLines > 0) {
        // 지워진 라인들의 중앙 위치를 계산합니다.
        // rows 배열은 내림차순으로 정렬되어 있으므로 rows[0]이 가장 아래쪽 라인입니다.
        const midRow = (rows[0] + rows[rows.length - 1]) / 2;
        const explosionY = (midRow + 0.5) * BLOCK_SIZE;
        const explosionX = (COLS / 2) * BLOCK_SIZE;
        createExplosion(explosionX, explosionY, clearedLines);
    }
    // --- 여기까지 ---

    let flashCount = 0;
    const maxFlashes = 4; // 짝수 번 깜빡임
    const flashInterval = 80; // ms

    const flasher = setInterval(() => {
        flashCount++;
        rows.forEach(y => {
            for (let x = 0; x < COLS; x++) {
                board[y][x] = (flashCount % 2 === 1) ? 'white' : 0;
            }
        });

        if (flashCount >= maxFlashes) {
            clearInterval(flasher);
            
            // 5. 애니메이션이 끝나면 실제로 줄을 제거합니다.
            // 먼저, 완성된 모든 줄을 제거합니다. (인덱스가 꼬이지 않도록 내림차순으로 정렬된 rows 배열을 사용합니다)
            rows.forEach(y => {
                board.splice(y, 1);
            });
            // 그 다음, 제거된 줄의 수만큼 새로운 빈 줄을 맨 위에 추가합니다.
            for (let i = 0; i < rows.length; i++) {
                board.unshift(Array(COLS).fill(0));
            }

            // --- 보너스 점수 계산 로직 ---
            const lineScores = [0, 100, 300, 500, 800]; // 기본 점수
            let baseScore = lineScores[clearedLines] * level;
            let isDifficultClear = false; // 테트리스 또는 T-Spin 여부
            let bonusText = '';

            if (isTSpin) {
                isDifficultClear = true;
                const tSpinScores = [100, 800, 1200, 1600]; // 0, 1, 2, 3 라인
                baseScore = tSpinScores[clearedLines] * level;
                bonusText = 'T-Spin';
                if (clearedLines === 2) bonusText += ' Double!';
                if (clearedLines === 3) bonusText += ' Triple!';
            } else if (clearedLines === 4) { // Tetris
                isDifficultClear = true;
                bonusText = 'TETRIS!';
            } else {
                if (clearedLines === 2) bonusText = 'Double!';
                if (clearedLines === 3) bonusText = 'Triple!';
            }

            // Back-to-Back 보너스
            if (isDifficultClear) {
                if (isBackToBack) {
                    baseScore *= 1.5;
                    bonusText = 'Back-to-Back<br>' + bonusText;
                }
                isBackToBack = true;
            } else if (clearedLines > 0) {
                isBackToBack = false;
            }

            // 콤보 보너스
            if (comboCounter > 1) {
                const comboBonus = 50 * (comboCounter - 1) * level;
                baseScore += comboBonus;
                // 콤보 텍스트를 기존 보너스 텍스트에 추가합니다.
                if (bonusText) {
                    bonusText += `<br>Combo ${comboCounter - 1}x`;
                } else {
                    bonusText = `Combo ${comboCounter - 1}x`;
                }
            }

            if (bonusText) {
                showFloatingText(bonusText);
            }

            score += Math.round(baseScore);
            lines += clearedLines;

            // 6. 다음 게임 상태로 전환합니다.
            playerReset();
            updateScoreAndLevel();
            dropCounter = 0;
            isAnimating = false;
        }
    }, flashInterval);
}

/**
 * 플레이어 블록을 회전시킵니다. 벽에 부딪히면 옆으로 밀어냅니다(Wall Kick).
 * @param {number} dir - 회전 방향 (1: 시계, -1: 반시계)
 */
function playerRotate(dir) {
    if (isAnimating) return;

    // 회전하기 전의 원래 모양과 위치를 저장합니다.
    const originalMatrix = JSON.parse(JSON.stringify(player.matrix));
    const originalPos = JSON.parse(JSON.stringify(player.pos));

    rotateMatrix(player.matrix, dir);
    playSound('rotate');

    // 'Wall Kick' 테스트를 위한 오프셋 목록입니다.
    // 블록을 회전시켰을 때 다른 블록이나 벽에 겹치면, 이 위치들로 살짝 밀어보며 들어갈 수 있는지 확인합니다.
    const kickOffsets = [
        { x: 0, y: 0 },    // 안 밀어보기 (No kick)
        { x: 1, y: 0 },    // 오른쪽 1 (Right 1)
        { x: -1, y: 0 },   // 왼쪽 1 (Left 1)
        { x: 0, y: -1 },   // 위로 1 (Up 1)
        { x: 1, y: -1 },   // 대각선 (Up-Right)
        { x: -1, y: -1 },  // 대각선 (Up-Left)
        { x: 0, y: -2 },   // 위로 2 (Up 2)
        { x: 2, y: 0 },    // 오른쪽 2 (Right 2)
        { x: -2, y: 0 },   // 왼쪽 2 (Left 2)
        { x: 1, y: -2 },   // 위로 2, 오른쪽 1
        { x: -1, y: -2 },  // 위로 2, 왼쪽 1
    ];

    for (const offset of kickOffsets) {
        player.pos.x += offset.x;
        player.pos.y += offset.y;

        if (!collide(board, player)) {
            // 충돌하지 않는 위치를 찾았으면 회전 성공
            lastMoveWasRotate = true;
            return;
        }

        // 충돌했다면, 다음 테스트를 위해 위치를 원래대로 되돌립니다.
        player.pos.x = originalPos.x;
        player.pos.y = originalPos.y;
    }

    // 모든 'kick'을 시도해도 들어갈 곳이 없으면, 회전 자체를 취소하고 원래 모양과 위치로 되돌립니다.
    player.matrix = originalMatrix;
    player.pos = originalPos;
}

/** 행렬을 회전시키는 헬퍼 함수 */
function rotateMatrix(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    // 반시계 방향 회전: 전치 후 행의 순서를 뒤집습니다.
    matrix.reverse();
}

/**
 * T-Spin 조건을 확인하는 헬퍼 함수
 * @param {Array<Array<number>>} board - 게임 보드
 * @param {object} player - 플레이어 객체
 * @returns {boolean} T-Spin 조건 충족 시 true
 */
function checkForTSpin(board, player) {
    // T 블록의 3x3 바운딩 박스의 네 모서리를 확인합니다.
    // T 블록의 모양(PIECES['T'])에서 실제 블록이 있는 중심점을 기준으로 합니다.
    const { pos, matrix } = player;
    const corners = [
        { y: pos.y,     x: pos.x },     // Top-left
        { y: pos.y,     x: pos.x + 2 }, // Top-right
        { y: pos.y + 2, x: pos.x },     // Bottom-left
        { y: pos.y + 2, x: pos.x + 2 }  // Bottom-right
    ];

    let occupiedCorners = 0;
    for (const corner of corners) {
        // 보드 밖이거나 (벽)
        if (corner.x < 0 || corner.x >= COLS || corner.y >= ROWS ||
            // 다른 블록으로 채워져 있는 경우
            (board[corner.y] && board[corner.y][corner.x] !== 0)) {
            occupiedCorners++;
        }
    }
    return occupiedCorners >= 3;
}

/**
 * 현재 블록을 홀드 영역으로 보내거나, 홀드된 블록과 교체합니다.
 */
function playerHold() {
    if (!canHold || isAnimating) return;
    canHold = false;

    if (heldPieceType) {
        // 현재 블록과 홀드된 블록을 교체
        [player.type, heldPieceType] = [heldPieceType, player.type];

        // 교체된 블록(이전 홀드 블록)으로 플레이어 상태 리셋
        player.matrix = PIECES[player.type];
        // 현재 활성화된 테마에서 색상을 가져옵니다.
        player.color = currentColors[player.type];
        player.pos.y = 0;
        player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);

        if (collide(board, player)) {
            handleGameOver();
        }
    } else {
        // 처음으로 홀드하는 경우
        heldPieceType = player.type;
        playerReset(); // 다음 블록 큐에서 새 블록을 가져옴
    }
    drawHoldPiece();
}

/**
 * 게임 오버 시 UI를 업데이트하고, 재시작 버튼을 활성화합니다.
 */
function handleGameOver() {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null; // 게임 루프가 중지되었음을 명확히 함
    playSound('gameover');
    isGameOver = true; // 게임 오버 상태를 true로 설정

    // 게임 오버 화면 표시
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = `${BLOCK_SIZE}px "Segoe UI"`;
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);

    updateHighScore();
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    restartBtn.disabled = true;
    startBtn.textContent = '다시 시작';
    document.querySelectorAll('input[name="difficulty"]').forEach(radio => radio.disabled = false);
}

/** 점수, 레벨, UI를 업데이트합니다. */
function updateScoreAndLevel() {
    const oldLevel = level;
    level = Math.floor(lines / 10) + 1;

    // 난이도와 레벨에 따라 블록 하강 속도를 조절합니다.
    dropInterval = Math.max(
        MIN_DROP_INTERVAL,
        currentDifficulty.initialInterval - (level - 1) * currentDifficulty.speedUpPerLevel
    );

    // 레벨이 올랐을 경우에만 테마를 변경합니다.
    if (level > oldLevel) {
        // (level - 1)을 사용하여 레벨 1은 첫 번째 테마, 레벨 2는 두 번째 테마를 사용하도록 합니다.
        currentColors = COLOR_THEMES[(level - 1) % COLOR_THEMES.length];
    }

    scoreElem.textContent = score;
    levelElem.textContent = level;
    updateHighScore();
}

/** 최고 점수를 업데이트하고 localStorage에 저장합니다. */
function updateHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('tetrisHighScore', highScore);
    }
    highScoreElem.textContent = highScore;
}

/** localStorage에서 최고 점수를 불러옵니다. */
function loadHighScore() {
    highScore = localStorage.getItem('tetrisHighScore') || 0;
    highScoreElem.textContent = highScore;
}

/**
 * 게임을 시작하는 함수
 */
function startGame() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // 선택된 난이도를 가져와 설정합니다.
    const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked').value;
    currentDifficulty = DIFFICULTY_SETTINGS[selectedDifficulty];

    // 게임 상태 초기화
    board = createBoard();
    player = JSON.parse(JSON.stringify(playerInitialState)); // Deep copy
    score = 0;
    level = 1;
    pieceBag = [];
    isPaused = false;
    lines = 0;
    heldPieceType = null;
    isBackToBack = false;
    canHold = true;
    lastMoveWasRotate = false;
    comboCounter = 0;
    dropCounter = 0;
    lastTime = 0;
    isGameOver = false; // 게임 시작 시 isGameOver를 false로 초기화

    // UI 초기화
    currentColors = COLOR_THEMES[0]; // 게임 시작 시 첫 번째 테마로 설정
    updateScoreAndLevel();
    drawHoldPiece(); // 홀드 칸 비우기

    // 7-Bag 시스템으로 첫 블록들을 준비합니다.
    refillPieceBag();
    nextPieceType = pieceBag.pop();

    playerReset();
    update();

    startBtn.disabled = true;
    pauseBtn.disabled = false;
    restartBtn.disabled = false;
    pauseBtn.textContent = '일시정지';
    document.querySelectorAll('input[name="difficulty"]').forEach(radio => radio.disabled = true);
}

/** 다음 블록을 미리 보여주는 함수 */
function drawNextPiece() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const matrix = PIECES[nextPieceType];
    const color = currentColors[nextPieceType];
    // 캔버스 중앙에 블록을 그리기 위해 오프셋을 동적으로 계산합니다.
    const offsetX = (nextCanvas.width / BLOCK_SIZE - matrix[0].length) / 2;
    const offsetY = (nextCanvas.height / BLOCK_SIZE - matrix.length) / 2;
    drawMatrix.call({ ctx: nextCtx }, matrix, { x: offsetX, y: offsetY }, color);
}

/** 홀드된 블록을 보여주는 함수 */
function drawHoldPiece() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (heldPieceType) {
        const matrix = PIECES[heldPieceType];
        const color = currentColors[heldPieceType];
        // 캔버스 중앙에 블록을 그리기 위해 오프셋을 동적으로 계산합니다.
        const offsetX = (holdCanvas.width / BLOCK_SIZE - matrix[0].length) / 2;
        const offsetY = (holdCanvas.height / BLOCK_SIZE - matrix.length) / 2;
        drawMatrix.call({ ctx: holdCtx }, matrix, { x: offsetX, y: offsetY }, color);
    }
}

/** 고스트 피스를 그리는 함수 */
function drawGhostPiece() {
    const ghost = JSON.parse(JSON.stringify(player)); // Deep copy
    while (!collide(board, ghost)) {
        ghost.pos.y++;
    }
    ghost.pos.y--;
    drawMatrix(ghost.matrix, ghost.pos, GHOST_COLOR);
}

/** 사운드를 재생하는 함수 */
function playSound(id) {
    if (!isSoundOn) return; // 사운드가 꺼져있으면 즉시 반환
    const sound = document.getElementById(`sound-${id}`);
    if (sound) {
        sound.currentTime = 0;
        sound.play();
    }
}

/**
 * 게임 보드 위에 보너스 텍스트를 띄웁니다.
 * @param {string} text - 표시할 텍스트
 */
function showFloatingText(text) {
    const textElem = document.createElement('div');
    textElem.classList.add('floating-text');
    textElem.innerHTML = text;

    const wrapper = document.querySelector('.game-board-wrapper');
    if (wrapper) {
        wrapper.appendChild(textElem);
        textElem.addEventListener('animationend', () => {
            textElem.remove();
        });
    }
}

/**
 * 라인 클리어 시 폭발 애니메이션을 생성합니다.
 * @param {number} centerX - 폭발 중심의 X 좌표 (px)
 * @param {number} centerY - 폭발 중심의 Y 좌표 (px)
 * @param {number} lineCount - 지워진 라인 수
 */
function createExplosion(centerX, centerY, lineCount) {
    const wrapper = document.querySelector('.game-board-wrapper');
    if (!wrapper) return;

    // 라인 수에 따라 파티클 개수, 폭발 반경, 크기를 다르게 설정
    const particleCount = 30 * lineCount; // 1줄: 30, 2줄: 60, ... (더 풍성하게)
    const maxDistance = 80 + (lineCount * 60);   // 폭발이 퍼지는 최대 반경 (2배 증가)
    const particleSize = 4 + (lineCount * 2);    // 파티클의 크기 (2배 증가)

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.classList.add('explosion-particle');

        // 파티클의 초기 위치 및 크기 설정
        particle.style.width = `${particleSize}px`;
        particle.style.height = `${particleSize}px`;
        particle.style.left = `${centerX}px`;
        particle.style.top = `${centerY}px`;

        // 각 파티클이 날아갈 랜덤한 방향과 거리 계산
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * maxDistance;
        const finalX = Math.cos(angle) * distance;
        const finalY = Math.sin(angle) * distance;

        // CSS 변수를 사용하여 각 파티클의 최종 위치를 전달
        particle.style.setProperty('--explode-transform', `translate(${finalX}px, ${finalY}px)`);
        
        // 파티클 색상을 다양하게 하여 더 화려하게 만듭니다.
        const colors = ['#f1c40f', '#e67e22', '#e74c3c', '#ecf0f1'];
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

        wrapper.appendChild(particle);

        // 애니메이션이 끝나면 DOM에서 제거하여 메모리를 관리합니다.
        particle.addEventListener('animationend', () => {
            particle.remove();
        });
    }
}

/**
 * 사운드 ON/OFF 상태를 토글하고 UI를 업데이트합니다.
 */
function toggleSound() {
    isSoundOn = !isSoundOn;
    // 설정을 로컬 스토리지에 저장하여 브라우저를 껐다 켜도 유지되도록 합니다.
    localStorage.setItem('tetrisSoundOn', isSoundOn);
    updateSoundButton();
}

/**
 * 사운드 버튼의 텍스트와 스타일을 현재 상태에 맞게 업데이트합니다.
 */
function updateSoundButton() {
    soundBtn.textContent = isSoundOn ? 'Sound ON' : 'Sound OFF';
    if (isSoundOn) {
        soundBtn.classList.remove('sound-off');
    } else {
        soundBtn.classList.add('sound-off');
    }
}

/**
 * 게임을 일시정지하거나 재개합니다.
 */
function togglePause() {
    // 게임이 시작되지 않았거나 게임오버 상태면 일시정지 불가
    if (!animationFrameId) return;

    isPaused = !isPaused;

    if (isPaused) {
        cancelAnimationFrame(animationFrameId);
        // PAUSED 오버레이 표시
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = `${BLOCK_SIZE}px "Segoe UI"`;
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
        pauseBtn.textContent = '계속하기';
    } else {
        pauseBtn.textContent = '일시정지';
        update(); // 게임 루프 재개
    }
}

/**
 * 모바일 기기인지 확인합니다.
 * @returns {boolean}
 */
function isMobile() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 모바일 환경을 위한 터치 컨트롤을 설정합니다.
 */
function setupTouchControls() {
    if (!isMobile()) return;

    document.body.classList.add('mobile');

    const touchLeft = document.getElementById('touch-left');
    const touchRight = document.getElementById('touch-right');
    const touchDown = document.getElementById('touch-down');
    const touchRotate = document.getElementById('touch-rotate');
    const touchHardDrop = document.getElementById('touch-hard-drop');
    const touchHold = document.getElementById('touch-hold');

    let moveInterval;
    const moveDelay = 120; // ms

    const startMove = (action) => {
        if (isPaused || isAnimating || !animationFrameId) return;
        action(); // Execute once immediately
        clearInterval(moveInterval);
        moveInterval = setInterval(action, moveDelay);
    };

    const stopMove = () => {
        clearInterval(moveInterval);
    };

    const addContinuousTouch = (element, action) => {
        element.addEventListener('touchstart', (e) => { e.preventDefault(); startMove(action); }, { passive: false });
        element.addEventListener('touchend', stopMove);
        element.addEventListener('touchcancel', stopMove);
    };

    const addSingleTouch = (element, action) => {
        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (isPaused || isAnimating || !animationFrameId) return;
            action();
        }, { passive: false });
    };

    addContinuousTouch(touchLeft, () => playerMove(-1));
    addContinuousTouch(touchRight, () => playerMove(1));
    addContinuousTouch(touchDown, playerDrop);

    addSingleTouch(touchRotate, () => playerRotate(1));
    addSingleTouch(touchHardDrop, playerHardDrop);
    addSingleTouch(touchHold, playerHold);
}
// --- 게임 루프 및 이벤트 핸들러 ---

/**
 * 게임 상태를 업데이트하고 화면을 다시 그리는 메인 루프
 * @param {number} time - requestAnimationFrame이 제공하는 타임스탬프
 */
function update(time = 0) {
    // 게임 루프는 isPaused나 isGameOver 상태가 되면 즉시 중단되어야 합니다.
    // cancelAnimationFrame이 호출되었으므로 이 함수는 더 이상 실행되지 않지만,
    // 만약을 대비한 방어 코드입니다.
    if (isPaused || isGameOver) return;

    const deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop(); // 이 함수 내부에서 게임 오버가 발생할 수 있습니다.
    }

    // playerDrop() 함수가 게임 오버를 유발했을 수 있습니다.
    // 이 경우, handleGameOver()에 의해 그려진 'GAME OVER' 화면이
    // 아래의 draw() 함수에 의해 지워지는 것을 방지하기 위해
    // 즉시 게임 루프를 중단해야 합니다.
    if (isGameOver) return;

    draw();
    animationFrameId = requestAnimationFrame(update);
}

// 키보드 입력 처리
document.addEventListener('keydown', event => {
    // 게임이 시작되지 않았으면 아무것도 하지 않음
    if (!animationFrameId && event.key !== 'Enter') {
        return;
    }

    // 'P' 키로 일시정지/재개
    if (event.key.toLowerCase() === 'p') {
        togglePause();
        return;
    }

    // 일시정지 상태에서는 다른 키 입력 무시
    if (isPaused) return;

    // 페이지 스크롤을 유발할 수 있는 키들의 기본 동작을 막습니다.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
        event.preventDefault();
    }

    switch (event.key) {
        case 'ArrowLeft':
            playerMove(-1);
            break;
        case 'ArrowRight':
            playerMove(1);
            break;
        case 'ArrowDown':
            playerDrop();
            lastMoveWasRotate = false;
            break;
        case 'ArrowUp':
            playerRotate(1);
            break;
        case ' ': // 스페이스바
            playerHardDrop();
            break;
        case 'c':
        case 'C':
            playerHold();
            break;
    }
});


/**
 * 게임 초기화
 */
function init() {
    // 로컬 스토리지에서 사운드 설정을 불러옵니다.
    const savedSoundSetting = localStorage.getItem('tetrisSoundOn');
    // 저장된 값이 없으면 true(ON)를 기본값으로, 있으면 해당 값을 boolean으로 변환합니다.
    isSoundOn = savedSoundSetting === null ? true : (savedSoundSetting === 'true');
    updateSoundButton();

    loadHighScore();

    // 이벤트 리스너 등록
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', togglePause);
    restartBtn.addEventListener('click', startGame); // '처음으로' 버튼 클릭 시 게임을 새로 시작
    soundBtn.addEventListener('click', toggleSound);
    setupTouchControls(); // 터치 컨트롤 설정
}

// 게임 초기화 함수 호출
init();

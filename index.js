// ==UserScript==
// @name         Chrome Haunted
// @namespace    http://wumuxi.com/
// @version      2025-11-01
// @description  让你的浏览器闹鬼
// @author       XTHON TEAM
// @match *://*/*
// @icon         https://xthon.wumuxi.com/ghost.png
// @grant        none
// ==/UserScript==
const BLOOD_TEXTURES = [
  "https://xthon.wumuxi.com/blood/1.png",
  "https://xthon.wumuxi.com/blood/2.png",
  "https://xthon.wumuxi.com/blood/3.png",
  "https://xthon.wumuxi.com/ghost.png",
];
const INITIAL_HP = 80;

/**
 * PageCanvas 类
 * * 功能：在页面顶层创建一个 canvas，用于高亮显示特定的 DOM 元素。
 */
class PageCanvas {
  /**
   * @constructor
   * 初始化 canvas 并将其附加到 DOM。
   */
  constructor() {
    // 1. 创建 canvas 元素
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");

    // 2. 设置样式，使其覆盖整个视口
    this.canvas.style.position = "fixed";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.zIndex = "99999"; // 确保在最顶层
    // this.canvas.style.pointerEvents = "none"; // 关键：允许鼠标事件穿透
    this.canvas.style.backgroundColor = "transparent"; // 初始透明

    // 3. 将 canvas 添加到页面
    document.documentElement.appendChild(this.canvas);

    // 4. 创建血贴图容器（放在canvas下面，和effectsContainer同一层）
    this.bloodTextureContainer = document.createElement("div");
    this.bloodTextureContainer.id = "hackathon-blood-textures-container";
    this.bloodTextureContainer.style.position = "fixed";
    this.bloodTextureContainer.style.top = "0";
    this.bloodTextureContainer.style.left = "0";
    this.bloodTextureContainer.style.width = "100%";
    this.bloodTextureContainer.style.height = "100%";
    this.bloodTextureContainer.style.zIndex = "99998"; // 在canvas之下，和effectsContainer同一层
    this.bloodTextureContainer.style.pointerEvents = "none";
    document.documentElement.insertAdjacentElement(
      "afterbegin",
      this.bloodTextureContainer
    );

    // 5. 内部存储高亮的元素
    // 使用 Map 来存储 { elem: { color, cancel, bloodImg } }
    this.highlightedElements = new Map();

    // 6. 注入血贴图动画CSS
    this._injectBloodTextureCSS();

    // 7. 绑定事件监听器
    // 绑定 'this' 以便在事件处理器中正确引用实例
    this._boundResizeHandler = this._onResize.bind(this);
    this._boundScrollHandler = this._onScroll.bind(this);

    window.addEventListener("resize", this._boundResizeHandler);
    // 使用 passive: true 提高滚动性能
    window.addEventListener("scroll", this._boundScrollHandler, {
      passive: true,
    });

    // 8. 初始设置 canvas 尺寸并渲染
    this._resizeCanvas();
    this.render();
  }

  randomColor() {
    // Generate a random number between 150 and 255 (inclusive) for a light color
    // 150 is the floor, 106 is the range (255 - 150 + 1)
    const min = 170;
    const max = 255;
    const range = max - min + 1;

    const r = Math.floor(Math.random() * range) + min;
    const g = Math.floor(Math.random() * range) + min;
    const b = Math.floor(Math.random() * range) + min;

    // Return the color in "rgb(r, g, b)" format
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * [Private] 注入血贴图动画CSS
   */
  _injectBloodTextureCSS() {
    if (document.getElementById("hackathon-blood-texture-style")) {
      return; // 已经注入过了
    }

    const style = document.createElement("style");
    style.id = "hackathon-blood-texture-style";
    style.textContent = `
      /* 血贴图浮入动画 */
      @keyframes blood-texture-fade-in {
        0% {
          opacity: 0;
          transform: scale(0.8) translateY(10px);
        }
        100% {
          opacity: 0.85;
          transform: scale(1) translateY(0);
        }
      }

      /* 血贴图浮出动画 */
      @keyframes blood-texture-fade-out {
        0% {
          opacity: 0.85;
          transform: scale(1) translateY(0);
        }
        100% {
          opacity: 0;
          transform: scale(0.8) translateY(-10px);
        }
      }

      .blood-texture-img {
        position: absolute;
        pointer-events: none;
        user-select: none;
        width: 100%;
        height: 100%;
        mix-blend-mode: multiply;
        animation: blood-texture-fade-in 0.4s ease-out forwards;
        /* 确保血贴图不会抖动，只改变大小 */
        transform-origin: center center;
      }

      .blood-texture-img.fade-out {
        animation: blood-texture-fade-out 0.3s ease-in forwards;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * [Private] 调整 canvas 尺寸以匹配视口和设备像素比 (DPR)
   */
  _resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    // 获取 CSS 像素的视口大小
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 设置 canvas 的物理像素（backstore）大小
    this.canvas.width = viewportWidth * dpr;
    this.canvas.height = viewportHeight * dpr;

    // 设置 canvas 的 CSS 像素大小
    this.canvas.style.width = `${viewportWidth}px`;
    this.canvas.style.height = `${viewportHeight}px`;

    this.canvas.onclick = (ev) => {
      const { clientX, clientY } = ev;

      // 遍历所有高亮元素
      for (const elem of this.highlightedElements.keys()) {
        const rect = elem.getBoundingClientRect();

        // 检查点击坐标是否在元素的 Bounding Box 内
        const isInside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;

        if (isInside) {
          // 如果在框内，就执行动作（例如 alert）
          // alert(`点击了高亮的元素: ${elem.tagName} #${elem.id}`);
          const { cancel } = this.highlightedElements.get(elem);
          cancel();
          this.unhighlight(elem); // 使用 unhighlight 以正确移除血贴图
          this.render();
          // return; // 找到第一个匹配的就停止遍历
        }
      }
    };

    // 缩放 context 以匹配 DPR，这样 1 个 CSS 像素就对应 1 个绘图单位
    this.ctx.scale(dpr, dpr);
  }

  /**
   * [Private] 窗口大小改变时的处理函数
   */
  _onResize() {
    this._resizeCanvas();
    this.render(); // 重新渲染
  }

  /**
   * [Private] 页面滚动时的处理函数
   */
  _onScroll() {
    this.render(); // 重新渲染
  }

  /**
   * 销毁 canvas 并移除所有事件监听器
   */
  destroy() {
    // 1. 移除 DOM
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }

    // 2. 移除血贴图容器
    if (this.bloodTextureContainer && this.bloodTextureContainer.parentNode) {
      this.bloodTextureContainer.parentNode.removeChild(
        this.bloodTextureContainer
      );
    }

    // 3. 移除事件监听器
    window.removeEventListener("resize", this._boundResizeHandler);
    window.removeEventListener("scroll", this._boundScrollHandler);

    // 4. 清空内部数据
    this.clear();
    console.log("PageCanvas destroyed.");
  }

  /**
   * 添加一个元素到高亮列表
   * @param {HTMLElement} elem - 需要高亮的 DOM 元素
   * @param {function} cancel - clearInterval canceller
   * @param {string} [color="yellow"] - 高亮颜色 (CSS 颜色字符串)
   */
  highlight(elem, cancel, color = this.randomColor()) {
    if (!elem || typeof elem.getBoundingClientRect !== "function") {
      console.warn("highlight: 传入的不是一个有效的 DOM 元素。");
      return;
    }

    // 创建血贴图图片元素
    const bloodImg = document.createElement("img");
    const randomTexture =
      BLOOD_TEXTURES[Math.floor(Math.random() * BLOOD_TEXTURES.length)];
    bloodImg.src = randomTexture;
    bloodImg.className = "blood-texture-img";

    // 获取元素位置并设置图片位置和大小
    const rect = elem.getBoundingClientRect();
    this._updateBloodTexturePosition(bloodImg, rect);

    // 将图片添加到容器
    this.bloodTextureContainer.appendChild(bloodImg);

    // 存储高亮元素信息，包括血贴图
    this.highlightedElements.set(elem, { color, cancel, bloodImg });
  }

  /**
   * [Private] 更新血贴图位置
   * @param {HTMLElement} bloodImg - 血贴图元素
   * @param {DOMRect} rect - 元素的位置信息
   * @param {number} scale - 缩放比例（默认1.0）
   */
  _updateBloodTexturePosition(bloodImg, rect, scale = 1.0) {
    // 确保最小宽度和高度为30px
    const width = Math.max(rect.width, 45) * scale;
    const height = Math.max(rect.height, 60) * scale;

    // 计算居中位置（考虑缩放）
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // 设置图片位置在元素中心，覆盖元素区域
    bloodImg.style.left = centerX - width / 2 + "px";
    bloodImg.style.top = centerY - height / 2 + "px";
    bloodImg.style.width = width + "px";
    bloodImg.style.height = height + "px";
  }

  /**
   * 从高亮列表中移除一个元素
   * @param {HTMLElement} elem - 需要取消高亮的 DOM 元素
   */
  unhighlight(elem) {
    if (this.highlightedElements.has(elem)) {
      const data = this.highlightedElements.get(elem);
      // 移除血贴图（带浮出动画）
      if (data.bloodImg && data.bloodImg.parentNode) {
        data.bloodImg.classList.add("fade-out");
        setTimeout(() => {
          if (data.bloodImg.parentNode) {
            data.bloodImg.remove();
          }
        }, 300); // 等待动画完成
      }
      this.highlightedElements.delete(elem);
    }
  }

  /**
   * 渲染所有高亮框
   * 这是核心绘图函数
   */
  render() {
    // 1. 清除整个 canvas (使用 CSS 像素单位)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. 设置全局半透明
    this.ctx.globalAlpha = 0.5;

    // 3. 遍历所有需要高亮的元素并绘制
    for (const [elem, data] of this.highlightedElements.entries()) {
      // 获取元素相对于视口的位置和大小
      const rect = elem.getBoundingClientRect();

      // 设置填充颜色
      this.ctx.fillStyle = data.color;

      // 绘制矩形
      this.ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

      // 更新血贴图位置（跟随元素位置变化，如滚动时）
      if (data.bloodImg) {
        const scale = data.bloodScale || 1.0;
        this._updateBloodTexturePosition(data.bloodImg, rect, scale);
      }
    }

    // 4. 恢复默认透明度
    this.ctx.globalAlpha = 1.0;
  }

  /**
   * 移除所有高亮
   */
  clear() {
    // 移除所有血贴图
    for (const [elem, data] of this.highlightedElements.entries()) {
      if (data.bloodImg && data.bloodImg.parentNode) {
        data.bloodImg.classList.add("fade-out");
        setTimeout(() => {
          if (data.bloodImg.parentNode) {
            data.bloodImg.remove();
          }
        }, 300);
      }
    }
    this.highlightedElements.clear();
    this.render(); // 重新渲染以清空
  }
}

function documentStart() {
  // 1. 定义一个全局控制开关
  // 初始设置为 false，即劫持代码暂时处于“静默”状态
  window.HACKATHON_GHOST_MODE_ACTIVE = false;

  // 2. 劫持 EventTarget.prototype.addEventListener
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (window.HACKATHON_GHOST_MODE_ACTIVE) {
      // 如果幽灵模式开启，我们只允许我们游戏自己需要的事件（例如 'click'），
      // 否则就阻止原生页面的事件注册。
      if (
        type !== "click" &&
        type !== "mousemove" &&
        type !== "mousedown" &&
        type !== "mouseup"
      ) {
        // 阻止原生网页的脚本注册大部分事件
        return;
      }
    }
    // 如果模式未开启，或事件在白名单内，则正常注册
    originalAddEventListener.call(this, type, listener, options);
  };

  // 3. 劫持 a 标签点击和 form 提交（阻止导航和跳转）
  // 覆盖 Element.prototype.click 和 Window.prototype.open，更彻底地控制页面跳转。
  const originalClick = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () {
    if (window.HACKATHON_GHOST_MODE_ACTIVE && this.tagName === "A") {
      // 阻止 a 标签的程序化点击
      return;
    }
    originalClick.apply(this, arguments);
  };

  // 劫持 window.open 防止弹出新窗口
  const originalWindowOpen = window.open;
  window.open = function () {
    if (window.HACKATHON_GHOST_MODE_ACTIVE) {
      console.log("Ghost Mode: Blocked window.open attempt.");
      return null;
    }
    return originalWindowOpen.apply(this, arguments);
  };

  // 4. 阻止 MutationObserver (防止 DOM 被动态修改)
  const originalMutationObserver = window.MutationObserver;
  if (originalMutationObserver) {
    window.MutationObserver = function (callback) {
      if (window.HACKATHON_GHOST_MODE_ACTIVE) {
        console.log("Ghost Mode: MutationObserver blocked from instantiation.");
        // 返回一个假对象，防止页面脚本崩溃
        return {
          observe: () => {},
          disconnect: () => {},
        };
      }
      return new originalMutationObserver(callback);
    };
  }
}

// --- 假设这里是你的游戏启动逻辑 ---
// 假设用户点击了你插入的“开始游戏”按钮或触发了某个事件

function solidification() {
  console.log("--- 游戏开始：激活幽灵模式和清除 DOM ---");

  // 步骤 A: 激活全局开关 (Critical!)
  // 在页面的原生环境中设置全局变量为 true，启用所有劫持逻辑
  document.documentElement.setAttribute("data-ghost-mode", "true"); // 用于通信

  // 通过将代码注入页面环境来激活全局变量
  const activationScript = document.createElement("script");
  activationScript.textContent = "window.HACKATHON_GHOST_MODE_ACTIVE = true;";
  (document.head || document.documentElement)
    .appendChild(activationScript)
    .remove();

  // 步骤 B: 禁用所有 a 标签和内联事件 (在扩展环境执行)

  // 1. 禁用所有 a 标签的默认行为（阻止导航/跳转）
  document.querySelectorAll("a").forEach((link) => {
    // 方法一：彻底移除 href 属性
    // link.removeAttribute('href');

    // 方法二：使用 JS 阻止默认行为（更安全，因为它保留了元素结构）
    link.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation(); // 阻止事件冒泡
      },
      true
    ); // 使用捕获阶段确保最早执行

    // 可选：添加 CSS 样式使其看起来像被禁用
    link.style.cursor = "default";
  });
  window.addEventListener("beforeunload", function (event) {
    // 设置一个条件，只在特定情况下弹出提示
    const isFormUnsaved = true; // 假设有一个变量来判断是否有未保存的数据

    if (isFormUnsaved) {
      // 多数现代浏览器会忽略自定义字符串，并显示一个标准提示。
      // 但返回非空字符串是触发提示的信号。
      const message = "您有未保存的更改，确定要离开吗？";

      // 规范要求您设置 returnValue 属性
      event.returnValue = message;

      // 早期浏览器也需要返回字符串
      return message;
    }
    // 如果返回 undefined 或不设置 returnValue，则不显示提示
  });

  // 2. 移除常见的内联事件处理器
  document.querySelectorAll("*").forEach((el) => {
    [
      "onclick",
      "onmouseover",
      "onsubmit",
      "onchange",
      "onmousedown",
      "onmouseup",
      "ontouchstart",
      "ontouchend",
    ].forEach((attr) => {
      if (el.getAttribute(attr)) {
        el.removeAttribute(attr);
      }
    });
  });

  // 3. 移除现有的 <script> 标签 (如果 document_start 阶段没有完全移除)
  document
    .querySelectorAll("script:not([data-my-extension-script])")
    .forEach((script) => {
      // 使用 data-my-extension-script 标记你的脚本，防止误删
      script.remove();
    });

  // 步骤 C: 固化网页样式和开始游戏逻辑
  document.body.style.overflow = "hidden"; // 禁止页面滚动
  // ... 你的游戏核心逻辑 (比如随机选择元素添加抖动效果) ...

  console.log("--- 幽灵模式已激活，页面已固化！ ---");
}

function startGhostMode() {
  // --- 1. Define the CSS for Effects ---
  const effectCSS = `
.effect-target {
    /* Ensures we can apply transformations and shadows */
    position: relative;
    transition: all 0.1s ease-out;
    display: inline-block; /* Important for seeing the shake/glitch effect */
}

/* --- Shake Effect --- */
@keyframes shake-animation {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-20px); }
    20%, 40%, 60%, 80% { transform: translateX(20px); }
}
.shake {
    animation: shake-animation 0.4s cubic-bezier(.36,.07,.19,.97) both;
}

/* --- Blink Effect --- */
@keyframes blink-animation {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
}
.blink {
    animation: blink-animation 0.2s steps(1, end) infinite alternate;
}

/* --- Glitch Effect --- */
@keyframes glitch-animation {
    0% { transform: translate(0); filter: drop-shadow(2px 0 0 red); }
    20% { transform: translate(-5px, 5px); filter: drop-shadow(-3px -3px 0 blue); }
    40% { transform: translate(-5px, -5px); filter: drop-shadow(3px 3px 0 green); }
    60% { transform: translate(5px, 5px); filter: drop-shadow(-3px 3px 0 red); }
    80% { transform: translate(5px, -5px); filter: drop-shadow(3px -3px 0 blue); }
    100% { transform: translate(0); filter: drop-shadow(-2px 0 0 green); }
}
.glitch {
    animation: glitch-animation 0.1s infinite;
}

/* --- Pulse Effect --- */
@keyframes pulse-animation {
    0% { transform: scale(1); box-shadow: 0 0 0 rgba(255, 165, 0, 0); }
    50% { transform: scale(1.05); box-shadow: 0 0 10px rgba(255, 165, 0, 0.8); }
    100% { transform: scale(1); box-shadow: 0 0 0 rgba(255, 165, 0, 0); }
}
.pulse {
    animation: pulse-animation 0.5s ease-in-out;
}

/* --- New Effect: Color Invert --- */
@keyframes invert-animation {
    0%, 100% { filter: invert(0) hue-rotate(0deg); }
    50% { filter: invert(100%) hue-rotate(180deg); }
}
.invert {
    animation: invert-animation 0.3s ease-in-out;
}

/* --- Tombstone Effect --- */
.tombstone {
    position: relative;
    pointer-events: none !important;
    cursor: not-allowed !important;
    filter: grayscale(100%) brightness(0.5);
    opacity: 0.6;
    background-image: url(https://xthon.wumuxi.com/blood/tombstone.png);
}
.tombstone * {
    pointer-events: none !important;
}
`;

  // --- 2. Inject CSS into the Head ---
  function injectCSS() {
    const style = document.createElement("style");
    style.type = "text/css";
    style.appendChild(document.createTextNode(effectCSS));
    document.head.appendChild(style);
  }

  // --- 3. Main Logic for Randomization ---

  const effects = [
    { className: "shake", duration: 400 },
    { className: "blink", duration: 1500 },
    { className: "glitch", duration: 500 },
    { className: "pulse", duration: 500 },
    { className: "invert", duration: 300 }, // Added the new effect
  ];

  // Wait for the DOM to be fully loaded before injecting CSS and starting the loop
  injectCSS();
  const canvas = new PageCanvas();

  // Elements must have the class 'effect-target' to be selected
  const elements = /* document.querySelectorAll(
    "span, img, div, picture, b, em, i, p, a, h1, h2, h3, h4, h5, h6, button, li"
    ); */ filterTextElements(document.body);
  if (elements.length === 0) {
    alert("该页面没有足够的可用元素来开始游戏");
    // TODO: Exit ghost mode
    return;
  }
  /**
   * Finds a random element and applies a random effect.
   * Decreses progress bar every sec.
   */
  function hauntRandomElem() {
    // console.log({
    //   currentHp: window.currentHP,
    //   hauntedElemCount: canvas.highlightedElements.size,
    // });

    // Get a random element and a random effect
    // 跳过已经是墓碑的元素
    const availableElements = elements.filter(
      (el) => !el.classList.contains("tombstone")
    );
    if (availableElements.length === 0) {
      return; // 没有可用元素了
    }

    let randomElement =
      availableElements[Math.floor(Math.random() * availableElements.length)];
    if (randomElement.classList.contains("effect-target")) {
      // already has effect-target, skip
      return;
    }
    if (randomElement.classList.contains("tombstone")) {
      return; // 已经是墓碑，跳过
    }

    const randomEffect = effects[Math.floor(Math.random() * effects.length)];
    const effectClasses = effects.map((e) => e.className);

    // Remove ALL effect classes to ensure only one effect plays at a time
    // and to allow the animation to reset and play again.
    effectClasses.forEach((c) => randomElement.classList.remove(c));

    // Apply the new random effect
    randomElement.classList.add(randomEffect.className);
    randomElement.classList.add("glitch");
    randomElement.classList.add("effect-target"); // Mark as having an active effect

    // 记录开始时间
    const startTime = Date.now();
    const TIMEOUT_MS = 10000; // 10秒

    // Start the interval that decreases HP every second
    let id = setInterval(() => {
      minusHPBar();
    }, 580);

    // 存储抖动动画帧ID，用于取消
    let shakeAnimationFrameId = null;
    let isCleared = false;

    // 动态更新抖动和血贴图大小的函数
    const updateShakeAndBloodTexture = () => {
      if (isCleared) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / TIMEOUT_MS, 1.0); // 0 到 1

      // 抖动幅度从基础值逐渐增加到最大值（0% -> 100%时，抖动从基础值增加到3倍）
      const baseShakeAmount = 20;
      const maxShakeAmount = 60;
      const currentShakeAmount =
        baseShakeAmount + (maxShakeAmount - baseShakeAmount) * progress;

      // 血贴图大小从1.0逐渐增加到2.0
      const baseBloodScale = 1.0;
      const maxBloodScale = 2.0;
      const currentBloodScale =
        baseBloodScale + (maxBloodScale - baseBloodScale) * progress;

      // 动态更新CSS动画的抖动幅度
      if (!randomElement.style.getPropertyValue("--shake-amount")) {
        randomElement.style.setProperty(
          "--shake-amount",
          `${currentShakeAmount}px`
        );
      } else {
        randomElement.style.setProperty(
          "--shake-amount",
          `${currentShakeAmount}px`
        );
      }

      // 更新血贴图大小
      const highlightedData = canvas.highlightedElements.get(randomElement);
      if (highlightedData && highlightedData.bloodImg) {
        highlightedData.bloodScale = currentBloodScale;
        const rect = randomElement.getBoundingClientRect();
        canvas._updateBloodTexturePosition(
          highlightedData.bloodImg,
          rect,
          currentBloodScale
        );
      }

      // 更新CSS抖动动画
      // 为每个元素生成唯一标识
      if (!randomElement.dataset.shakeId) {
        randomElement.dataset.shakeId = `shake-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 11)}`;
      }
      const styleId = randomElement.dataset.shakeId;

      let dynamicStyle = document.getElementById(styleId);
      if (!dynamicStyle) {
        dynamicStyle = document.createElement("style");
        dynamicStyle.id = styleId;
        document.head.appendChild(dynamicStyle);
      }

      // 创建动态抖动的keyframes，使用唯一的class选择器
      const uniqueClass = `dynamic-shake-${styleId}`;
      if (!randomElement.classList.contains(uniqueClass)) {
        randomElement.classList.add(uniqueClass);
      }

      dynamicStyle.textContent = `
        @keyframes shake-keyframe-${styleId} {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-${currentShakeAmount}px); }
          20%, 40%, 60%, 80% { transform: translateX(${currentShakeAmount}px); }
        }
        .${uniqueClass} {
          animation: shake-keyframe-${styleId} 0.4s cubic-bezier(.36,.07,.19,.97) infinite !important;
        }
      `;

      if (progress < 1.0) {
        shakeAnimationFrameId = requestAnimationFrame(
          updateShakeAndBloodTexture
        );
      }
    };

    // 开始更新抖动和血贴图
    updateShakeAndBloodTexture();

    // 10秒超时后变成墓碑
    const timeoutId = setTimeout(() => {
      if (isCleared) return;
      isCleared = true;

      // 停止减血
      clearInterval(id);

      // 停止抖动动画更新
      if (shakeAnimationFrameId) {
        cancelAnimationFrame(shakeAnimationFrameId);
      }

      // 移除所有效果类和highlight
      randomElement.classList.remove(randomEffect.className);
      randomElement.classList.remove("glitch");
      randomElement.classList.remove("effect-target");

      // 清理动态样式
      const styleId = randomElement.dataset.shakeId;
      if (styleId) {
        const dynamicStyle = document.getElementById(styleId);
        if (dynamicStyle) {
          dynamicStyle.remove();
        }
        // 移除动态class
        const uniqueClass = `dynamic-shake-${styleId}`;
        randomElement.classList.remove(uniqueClass);
        delete randomElement.dataset.shakeId;
      }

      // 移除事件监听器
      randomElement.removeEventListener("click", clearEffect);

      // 移除highlight和血贴图
      canvas.unhighlight(randomElement);
      canvas.render();

      // 变成墓碑
      randomElement.classList.add("tombstone");

      // 禁用所有交互
      randomElement.style.pointerEvents = "none";
      randomElement.style.cursor = "not-allowed";

      // 从elements数组中移除（通过标记而不是实际删除，因为数组是只读的）
      // 实际在下次选择时会过滤掉
    }, TIMEOUT_MS);

    const clearEffect = () => {
      if (isCleared) return;
      isCleared = true;

      clearTimeout(timeoutId);
      clearInterval(id);

      // 停止抖动动画更新
      if (shakeAnimationFrameId) {
        cancelAnimationFrame(shakeAnimationFrameId);
      }

      randomElement.classList.remove(randomEffect.className);
      randomElement.classList.remove("glitch");
      randomElement.classList.remove("effect-target");
      randomElement.removeEventListener("click", clearEffect);
      canvas.unhighlight(randomElement);
      canvas.render();
      addHPBar();

      // 清理动态样式
      const styleId = randomElement.dataset.shakeId;
      if (styleId) {
        const dynamicStyle = document.getElementById(styleId);
        if (dynamicStyle) {
          dynamicStyle.remove();
        }
        // 移除动态class
        const uniqueClass = `dynamic-shake-${styleId}`;
        randomElement.classList.remove(uniqueClass);
        delete randomElement.dataset.shakeId;
      }
    };

    canvas.highlight(randomElement, clearEffect);
    canvas.render();
    // Register click event BEFORE starting the interval
    randomElement.addEventListener("click", clearEffect);
  }
  hauntRandomElem();
  setInterval(hauntRandomElem, 1600);

  randomFullPageScaryEffect();
  // 每隔 4 秒随机显示一种全页面恐怖特效
  setInterval(() => {
    randomFullPageScaryEffect();
    hauntRandomElem();
  }, 3870);
}

function filterTextElements(element) {
  // find an element that
  // 1. has text and length >= 5
  // 2. is a block element
  // 3. is visible in current viewport
  // 4. does not contain any subelements that matches the above rules
  const visited = new WeakSet();
  const result = new Set();

  for (const leaf of element.querySelectorAll("*:not(:has(*))")) {
    let el = leaf;

    while (el && el !== document.body) {
      if (visited.has(el)) break;
      visited.add(el);

      // 判断当前元素是否符合条件
      const textLen = getTextLength(el);
      const visible = isInViewportAndLarge(el);
      const block = isBlockElement(el);

      if (textLen >= 5 && visible && block) {
        // 检查是否有子元素也匹配
        let hasMatchingChild = false;
        for (const child of el.children) {
          if (result.has(child)) {
            hasMatchingChild = true;
            break;
          }
        }

        if (!hasMatchingChild) {
          result.add(el);
        } else {
          // 子元素已匹配，则父不必再考虑
          result.delete(el);
        }
      }

      el = el.parentElement;
    }
  }
  return Array.from(result);
}

function isInViewportAndLarge(el) {
  const rect = el.getBoundingClientRect();
  const minHeightInPx = 0.02 * window.innerHeight; // 2% of the viewport height
  const minWidthInPx = 30; // 30 pixels
  // 满足尺寸要求
  const isLargeEnough =
    // 宽度必须大于 30px
    rect.width > minWidthInPx &&
    // 高度必须大于 2vh
    rect.height > minHeightInPx;
  if (!isLargeEnough) return false;

  // 检测是否长宽比过于离谱，比如超过 1/9 或 9/1
  const aspectRatio = rect.width / rect.height;
  if (aspectRatio < 0.1 || aspectRatio > 10) return false;

  // return (
  //   rect.top < window.innerHeight &&
  //   rect.bottom > 0 &&
  //   rect.left < window.innerWidth &&
  //   rect.right > 0
  // );
  return (
    // 頂部必須在視口頂端或以下
    rect.top >= 0 &&
    // 左側必須在視口左側或右側
    rect.left >= 0 &&
    // 底部必須在視口底端或以上
    rect.bottom <= window.innerHeight &&
    // 右側必須在視口右側或左側
    rect.right <= window.innerWidth
  );
}
function getTextLength(el) {
  return (el.innerText || "").trim().length;
}
function isBlockElement(el) {
  const display = window.getComputedStyle(el).display;
  return (
    display === "block" ||
    display === "flex" ||
    display === "grid" ||
    display === "table"
  );
}

function createHealthBar() {
  if (document.getElementById("hackathon-health-bar") != null) {
    return; // 已经创建过了
  }

  // 创建血条容器
  const healthBarContainer = document.createElement("div");
  healthBarContainer.id = "hackathon-health-bar";
  healthBarContainer.style.position = "fixed";
  healthBarContainer.style.top = "20px";
  healthBarContainer.style.left = "50%";
  healthBarContainer.style.transform = "translateX(-50%)";
  healthBarContainer.style.width = "50%"; // 占用 1/2 屏幕宽度
  healthBarContainer.style.zIndex = "99998"; // 在 canvas (99999) 之下
  healthBarContainer.style.display = "flex";
  healthBarContainer.style.flexDirection = "column";
  healthBarContainer.style.alignItems = "center";
  healthBarContainer.style.gap = "10px";

  // 创建血条背景（capsule 形状）
  const healthBarBg = document.createElement("div");
  healthBarBg.style.width = "100%";
  healthBarBg.style.height = "40px";
  healthBarBg.style.borderRadius = "20px"; // capsule 形状
  healthBarBg.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
  healthBarBg.style.position = "relative";
  healthBarBg.style.overflow = "hidden";
  healthBarBg.style.border = "2px solid rgba(255, 255, 255, 0.3)";
  healthBarBg.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.3)";

  // 创建血条填充（带渐变）
  const healthBarFill = document.createElement("div");
  healthBarFill.id = "hackathon-health-fill";
  healthBarFill.style.width = "100%";
  healthBarFill.style.height = "100%";
  healthBarFill.style.borderRadius = "20px";
  healthBarFill.style.transition = "width 0.5s ease-out";
  healthBarFill.style.background =
    "linear-gradient(90deg, #ff416c 0%, #ff4b2b 50%, #ff6b6b 100%)";
  healthBarFill.style.boxShadow =
    "inset 0 2px 4px rgba(255, 255, 255, 0.3), 0 0 10px rgba(255, 75, 43, 0.5)";

  // 创建血条文字
  const healthBarText = document.createElement("div");
  healthBarText.id = "hackathon-health-text";
  healthBarText.style.position = "absolute";
  healthBarText.style.top = "50%";
  healthBarText.style.left = "50%";
  healthBarText.style.transform = "translate(-50%, -50%)";
  healthBarText.style.color = "#ffffff";
  healthBarText.style.fontSize = "18px";
  healthBarText.style.fontWeight = "bold";
  healthBarText.style.textShadow = "1px 1px 2px rgba(0, 0, 0, 0.8)";
  healthBarText.style.pointerEvents = "none";
  healthBarText.style.zIndex = "1";

  // 组装元素
  healthBarBg.appendChild(healthBarFill);
  healthBarBg.appendChild(healthBarText);
  healthBarContainer.appendChild(healthBarBg);

  // 插入到页面（在 canvas 之前，确保在 canvas 之下）
  document.documentElement.insertAdjacentElement(
    "afterbegin",
    healthBarContainer
  );

  // 创建全页面特效容器层（和血条在同一层）
  const effectsContainer = document.createElement("div");
  effectsContainer.id = "hackathon-effects-container";
  effectsContainer.style.position = "fixed";
  effectsContainer.style.top = "0";
  effectsContainer.style.left = "0";
  effectsContainer.style.width = "100%";
  effectsContainer.style.height = "100%";
  effectsContainer.style.zIndex = "99998"; // 和血条同一层，在 canvas (99999) 之下
  effectsContainer.style.pointerEvents = "none";
  document.documentElement.insertAdjacentElement(
    "afterbegin",
    effectsContainer
  );

  // 创建游戏存活时长计时器（右上角，半透明，有轻微抖动效果）
  const gameTimer = document.createElement("div");
  gameTimer.id = "hackathon-game-timer";
  gameTimer.style.position = "absolute";
  gameTimer.style.top = "0";
  gameTimer.style.right = "-12ch";
  gameTimer.style.color = "rgba(255, 255, 255, 0.7)"; // 半透明白色
  gameTimer.style.fontSize = "32px"; // 比较大的字体
  gameTimer.style.fontWeight = "bold";
  gameTimer.style.fontFamily = "Comic Sans MS, cursive, sans-serif";
  gameTimer.style.textShadow = "2px 2px 4px rgba(0, 0, 0, 0.8)";
  gameTimer.style.pointerEvents = "none";
  gameTimer.style.zIndex = "10";
  gameTimer.style.userSelect = "none";
  gameTimer.textContent = "00:00";

  // 添加到血条容器
  healthBarContainer.appendChild(gameTimer);

  // 游戏开始时间（从创建血条时开始计时）
  window.gameStartTime = Date.now();

  // 轻微抖动效果：通过 requestAnimationFrame 动态改变 transform
  function updateShake() {
    if (window.gameDead) return; // 游戏结束停止抖动

    // 轻微的随机抖动，使用正弦波产生平滑的抖动效果
    const time = Date.now() / 100; // 降低频率使抖动更平滑
    const offsetX = Math.sin(time * 0.5) * 1.5; // 轻微的水平抖动
    const offsetY = Math.cos(time * 0.7) * 1.5; // 轻微的垂直抖动
    gameTimer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

    requestAnimationFrame(updateShake);
  }
  updateShake();

  // 更新计时器显示
  function updateTimer() {
    if (!gameTimer || window.gameDead) return;

    const elapsed = Math.floor((Date.now() - window.gameStartTime) / 1000); // 秒数
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    gameTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }

  // 每秒更新一次计时器
  const timerInterval = setInterval(updateTimer, 1000);
  updateTimer(); // 立即更新一次

  // 保存引用和清理函数
  window.gameTimer = gameTimer;
  window.clearGameTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
  };

  // 保存引用
  window.healthBarFill = healthBarFill;
  window.healthBarText = healthBarText;
  window.effectsContainer = effectsContainer;

  // 初始化血条
  updateHealthBar(INITIAL_HP);
}

function updateHealthBar(health /** @type {number} */) {
  if (!window.healthBarFill || !window.healthBarText) {
    return;
  }

  // 限制范围 0-100
  const clampedHealth = Math.max(0, Math.min(100, health));

  // 更新填充宽度
  window.healthBarFill.style.width = clampedHealth + "%";

  // 更新文字显示
  window.healthBarText.textContent = `${Math.round(clampedHealth)}/100`;

  // 根据血量调整渐变色
  if (clampedHealth > 60) {
    // 绿色渐变（健康）
    window.healthBarFill.style.background =
      "linear-gradient(90deg, #56ab2f 0%, #a8e063 50%, #7cb342 100%)";
  } else if (clampedHealth > 30) {
    // 黄色渐变（警告）
    window.healthBarFill.style.background =
      "linear-gradient(90deg, #f2994a 0%, #f2c94c 50%, #f39c12 100%)";
  } else {
    // 红色渐变（危险）
    window.healthBarFill.style.background =
      "linear-gradient(90deg, #ff416c 0%, #ff4b2b 50%, #ff6b6b 100%)";
  }
}

function minusHPBar() {
  let originalHp = window.currentHP ?? INITIAL_HP;
  window.currentHP = originalHp - (originalHp < 85 ? 1 : 2);
  updateHealthBar(window.currentHP);
  if (window.currentHP <= 0) {
    if (window.gameDead) return;
    alert("游戏结束，你被幽灵杀死了！");
    window.gameDead = true;
  }
}

function addHPBar() {
  let currentHp = window.currentHP ?? INITIAL_HP;
  window.currentHP =
    currentHp + (currentHp < 60 ? (currentHp < 30 ? 12 : 8) : 5);
  updateHealthBar(window.currentHP);
}

/*

1. fix li， per 字数？
2. ghost effect 多样化
3. UI 引导

*/

// 全页面恐怖效果样式注入（只在第一次调用时注入）
function injectFullPageEffectCSS() {
  if (document.getElementById("hackathon-fullpage-effects-style")) {
    return; // 已经注入过了
  }

  const style = document.createElement("style");
  style.id = "hackathon-fullpage-effects-style";
  style.textContent = `
    /* 血腥红色滤镜 */
    @keyframes bloody-red-filter {
      0% { filter: brightness(1) sepia(0) hue-rotate(0deg); }
      50% { filter: brightness(0.6) sepia(0.8) hue-rotate(0deg) contrast(1.2); }
      100% { filter: brightness(1) sepia(0) hue-rotate(0deg); }
    }
    .bloody-red-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle at center, rgba(139, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.7) 100%);
      pointer-events: none;
      animation: bloody-pulse 2s ease-in-out;
    }
    @keyframes bloody-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 0.9; }
    }

    /* 全页面 Glitch 效果 */
    @keyframes fullpage-glitch {
      0% { transform: translate(0); }
      5% { transform: translate(-10px, 5px); }
      10% { transform: translate(-5px, -5px); }
      15% { transform: translate(10px, 5px); }
      20% { transform: translate(5px, -5px); }
      25% { transform: translate(-10px, -5px); }
      30% { transform: translate(10px, -5px); }
      35% { transform: translate(-5px, 5px); }
      40% { transform: translate(5px, 5px); }
      45% { transform: translate(-10px, 5px); }
      50% { transform: translate(10px, -5px); }
      55% { transform: translate(-5px, -5px); }
      60% { transform: translate(5px, 5px); }
      65% { transform: translate(-10px, -5px); }
      70% { transform: translate(10px, 5px); }
      75% { transform: translate(-5px, -5px); }
      80% { transform: translate(5px, 5px); }
      85% { transform: translate(-10px, 5px); }
      90% { transform: translate(10px, -5px); }
      95% { transform: translate(-5px, 5px); }
      100% { transform: translate(0); }
    }
    .fullpage-glitch-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      background:
        repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.03) 2px, rgba(255, 0, 0, 0.03) 4px),
        repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0, 255, 0, 0.03) 2px, rgba(0, 255, 0, 0.03) 4px);
      animation: fullpage-glitch 0.3s steps(10) infinite;
    }

    /* 血滴效果 */
    .blood-drop {
      position: absolute;
      width: 8px;
      height: 15px;
      background: radial-gradient(ellipse at center, rgba(139, 0, 0, 0.9) 0%, rgba(101, 0, 0, 0.7) 50%, transparent 100%);
      border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
      pointer-events: none;
      animation: blood-drop-fall 3s ease-in forwards;
    }
    @keyframes blood-drop-fall {
      0% {
        transform: translateY(-20px) scale(0.5);
        opacity: 0.8;
      }
      100% {
        transform: translateY(calc(100vh + 20px)) scale(1);
        opacity: 0;
      }
    }

    /* 恐怖文字闪现 */
    .scary-text-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 72px;
      font-weight: bold;
      color: #8B0000;
      text-shadow:
        0 0 10px rgba(139, 0, 0, 0.8),
        0 0 20px rgba(139, 0, 0, 0.6),
        0 0 30px rgba(139, 0, 0, 0.4),
        4px 4px 0px rgba(0, 0, 0, 0.9);
      pointer-events: none;
      animation: scary-text-flash 1.5s ease-out forwards;
      font-family: 'Arial Black', sans-serif;
      letter-spacing: 4px;
      text-transform: uppercase;
    }
    @keyframes scary-text-flash {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.5) rotate(-5deg);
        filter: blur(10px);
      }
      20% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1.1) rotate(2deg);
        filter: blur(0px);
      }
      40% {
        transform: translate(-50%, -50%) scale(1) rotate(-1deg);
      }
      60% {
        transform: translate(-50%, -50%) scale(1.05) rotate(1deg);
      }
      80% {
        transform: translate(-50%, -50%) scale(1) rotate(0deg);
        opacity: 0.9;
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.8) rotate(3deg);
        filter: blur(5px);
      }
    }

    /* 暗影闪烁效果 */
    @keyframes shadow-flicker {
      0%, 100% {
        background: rgba(0, 0, 0, 0.3);
        filter: brightness(1);
      }
      10% {
        background: rgba(139, 0, 0, 0.5);
        filter: brightness(0.7);
      }
      20% {
        background: rgba(0, 0, 0, 0.6);
        filter: brightness(0.5);
      }
      30% {
        background: rgba(139, 0, 0, 0.4);
        filter: brightness(0.8);
      }
      40% {
        background: rgba(0, 0, 0, 0.4);
        filter: brightness(0.9);
      }
      50% {
        background: rgba(139, 0, 0, 0.6);
        filter: brightness(0.6);
      }
      60% {
        background: rgba(0, 0, 0, 0.5);
        filter: brightness(0.7);
      }
      70% {
        background: rgba(139, 0, 0, 0.3);
        filter: brightness(0.85);
      }
      80% {
        background: rgba(0, 0, 0, 0.35);
        filter: brightness(0.95);
      }
      90% {
        background: rgba(139, 0, 0, 0.4);
        filter: brightness(0.75);
      }
    }
    .shadow-flicker-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      animation: shadow-flicker 2s ease-in-out;
    }
  `;
  document.head.appendChild(style);
}

// 全页面恐怖效果函数
function randomFullPageScaryEffect() {
  injectFullPageEffectCSS(); // 确保CSS已注入

  const effects = [
    effectBloodyRedFilter,
    effectFullPageGlitch,
    effectBloodDrops,
    effectScaryText,
    effectShadowFlicker,
  ];

  // 随机选择一个效果
  const randomEffect = effects[Math.floor(Math.random() * effects.length)];
  randomEffect();
}

// 效果1: 血腥红色滤镜
function effectBloodyRedFilter() {
  if (!window.effectsContainer) return;
  const overlay = document.createElement("div");
  overlay.className = "bloody-red-overlay";
  window.effectsContainer.appendChild(overlay);

  setTimeout(() => {
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.5s ease-out";
    setTimeout(() => overlay.remove(), 500);
  }, 2000);
}

// 效果2: 全页面 Glitch
function effectFullPageGlitch() {
  if (!window.effectsContainer) return;
  const overlay = document.createElement("div");
  overlay.className = "fullpage-glitch-overlay";
  window.effectsContainer.appendChild(overlay);

  setTimeout(() => {
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.3s ease-out";
    setTimeout(() => overlay.remove(), 300);
  }, 800);
}

// 效果3: 血滴效果
function effectBloodDrops() {
  if (!window.effectsContainer) return;
  const dropCount = 15 + Math.floor(Math.random() * 10);

  for (let i = 0; i < dropCount; i++) {
    setTimeout(() => {
      const drop = document.createElement("div");
      drop.className = "blood-drop";
      drop.style.left = Math.random() * 100 + "%";
      drop.style.animationDelay = Math.random() * 0.5 + "s";
      drop.style.width = 6 + Math.random() * 6 + "px";
      drop.style.height = 12 + Math.random() * 10 + "px";
      window.effectsContainer.appendChild(drop);

      setTimeout(() => drop.remove(), 3000);
    }, i * 100);
  }
}

// 效果4: 恐怖文字闪现
function effectScaryText() {
  if (!window.effectsContainer) return;
  const scaryTexts = [
    "DEATH",
    "HALLOWEEN",
    "HELL",
    "KILL",
    "HAUNTED",
    "鬼屋",
    "HACK IT!",
    "BLOOD",
    "FEAR",
    "鬼屋",
    "XTHON",
    "HAUNTED",
    "DIE",
    "DEATH",
    "EVIL",
    "PAIN",
  ];

  const text = scaryTexts[Math.floor(Math.random() * scaryTexts.length)];
  const overlay = document.createElement("div");
  overlay.className = "scary-text-overlay";
  overlay.textContent = text;
  window.effectsContainer.appendChild(overlay);

  setTimeout(() => overlay.remove(), 1500);
}

// 效果5: 暗影闪烁
function effectShadowFlicker() {
  if (!window.effectsContainer) return;
  const overlay = document.createElement("div");
  overlay.className = "shadow-flicker-overlay";
  window.effectsContainer.appendChild(overlay);

  setTimeout(() => {
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.5s ease-out";
    setTimeout(() => overlay.remove(), 500);
  }, 2000);
}

// TITLE: Chrome Haunted
const startGame = () => {
  solidification();
  startGhostMode();
  createHealthBar(); 
}

// 创建 ghost 按钮
function createGhostButton() {
  // 检查是否已经存在按钮
  if (document.getElementById("hackathon-ghost-button")) {
    return;
  }

  // 创建按钮元素
  const ghostButton = document.createElement("button");
  ghostButton.id = "hackathon-ghost-button";
  ghostButton.textContent = "👻";
  ghostButton.style.position = "fixed";
  ghostButton.style.bottom = "20px";
  ghostButton.style.right = "20px";
  ghostButton.style.width = "60px";
  ghostButton.style.height = "60px";
  ghostButton.style.borderRadius = "50%";
  ghostButton.style.border = "none";
  ghostButton.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  ghostButton.style.color = "#ffffff";
  ghostButton.style.fontSize = "30px";
  ghostButton.style.cursor = "pointer";
  ghostButton.style.zIndex = "999999";
  ghostButton.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.3), 0 0 20px rgba(139, 0, 0, 0.5)";
  ghostButton.style.transition = "transform 0.2s, box-shadow 0.2s";

  // 悬停效果
  ghostButton.addEventListener("mouseenter", () => {
    ghostButton.style.transform = "scale(1.1)";
    ghostButton.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.4), 0 0 30px rgba(139, 0, 0, 0.7)";
  });

  ghostButton.addEventListener("mouseleave", () => {
    ghostButton.style.transform = "scale(1)";
    ghostButton.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.3), 0 0 20px rgba(139, 0, 0, 0.5)";
  });

  // 点击事件
  ghostButton.addEventListener("click", () => {
    const confirmed = confirm("万圣节的午夜，数据帷幕变得薄弱……邪恶的代码幽灵涌入互联网，附身到网页元素上! 你能成为数据驱魔师，净化这些被附身的元素吗？\n请点击“闹鬼”的元素，来净化页面。");

    if (confirmed) {
      // 删除按钮
      ghostButton.remove();
      // 开始游戏
      startGame();
    }
  });

  // 添加到页面
  document.documentElement.appendChild(ghostButton);
}

// 页面加载时创建 ghost 按钮
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", createGhostButton);
} else {
  createGhostButton();
}

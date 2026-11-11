/* 海克斯图鉴 · 看图识强化  交互逻辑 */
(function () {
  "use strict";
  var DATA = window.HEX_DATA || [];
  var TIER_NAME = { 1: "白银", 2: "黄金", 3: "棱彩" };

  /* ---------- 工具 ---------- */
  function tierOf(file) {
    var m = /(\d)\.png$/.exec(file);
    return m ? parseInt(m[1], 10) : 0;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function $(s, root) { return (root || document).querySelector(s); }
  function $all(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  // 图片加载失败兜底
  window.HexImgErr = function (img) {
    img.hidden = true;
    var fb = img.parentElement && img.parentElement.querySelector("[data-fb]");
    if (fb) fb.hidden = false;
  };

  /* ---------- 视图切换 ---------- */
  var views = ["home", "quiz", "result", "collection"];
  function showView(name) {
    views.forEach(function (v) {
      var el = document.getElementById("view-" + v);
      if (el) el.hidden = (v !== name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- 最佳成绩 ---------- */
  var BEST_KEY = "hexQuizBest";
  function getBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || null; } catch (e) { return null; } }
  function setBest(rec) { try { localStorage.setItem(BEST_KEY, JSON.stringify(rec)); } catch (e) {} }
  function renderBest() {
    var b = getBest();
    $("#bestStat").innerHTML = b ? ("最佳正确率 <b>" + b.acc + "%</b>（" + b.correct + "/" + b.total + "）") : "";
  }

  /* ---------- 首页设置 ---------- */
  var cfg = { tier: 0, count: 10 };
  document.getElementById("totalCount").textContent = DATA.length;

  $all("#tierChips .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      $all("#tierChips .chip").forEach(function (x) { x.classList.remove("is-active"); });
      c.classList.add("is-active");
      cfg.tier = parseInt(c.dataset.tier, 10);
    });
  });
  $all("#countChips .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      $all("#countChips .chip").forEach(function (x) { x.classList.remove("is-active"); });
      c.classList.add("is-active");
      cfg.count = parseInt(c.dataset.count, 10);
    });
  });

  $("#goHome").addEventListener("click", function () { showView("home"); });
  $all(".mode-card").forEach(function (card) {
    card.addEventListener("click", function () {
      var go = card.dataset.go;
      if (go === "collection") { showView("collection"); renderBook(); }
      else { $("#setup").scrollIntoView({ behavior: "smooth", block: "center" }); }
    });
  });

  /* ---------- 闯关核心 ---------- */
  var quiz = { list: [], idx: 0, score: 0, streak: 0, bestStreak: 0, wrong: [], cur: null, locked: false, optsShown: false, _autoTimer: null };
  function clearAutoTimer() { if (quiz._autoTimer) { clearTimeout(quiz._autoTimer); quiz._autoTimer = null; } }

  function buildPool() {
    var pool = cfg.tier === 0 ? DATA : DATA.filter(function (x) { return tierOf(x.i) === cfg.tier; });
    pool = shuffle(pool);
    if (cfg.count > 0 && cfg.count < pool.length) pool = pool.slice(0, cfg.count);
    return pool;
  }

  function makeOptions(correct) {
    var t = tierOf(correct.i);
    var sameTier = shuffle(DATA.filter(function (x) {
      return tierOf(x.i) === t && x.i !== correct.i && x.n !== correct.n;
    }));
    var used = {}; used[correct.n] = 1;
    var distract = [];
    for (var i = 0; i < sameTier.length && distract.length < 3; i++) {
      if (!used[sameTier[i].n]) { used[sameTier[i].n] = 1; distract.push(sameTier[i]); }
    }
    if (distract.length < 3) { // 同阶不足则跨阶补
      var rest = shuffle(DATA.filter(function (x) { return x.i !== correct.i && !used[x.n]; }));
      for (var j = 0; j < rest.length && distract.length < 3; j++) {
        used[rest[j].n] = 1; distract.push(rest[j]);
      }
    }
    return shuffle([correct].concat(distract));
  }

  function loadQuestion() {
    clearAutoTimer();
    quiz.locked = false;
    var cur = quiz.list[quiz.idx];
    quiz.cur = cur;
    var t = tierOf(cur.i);

    $("#qIndex").textContent = quiz.idx + 1;
    $("#qTotal").textContent = quiz.list.length;
    $("#qScore").textContent = quiz.score;
    $("#qStreak").textContent = quiz.streak;
    $("#progressBar").style.width = (quiz.idx / quiz.list.length * 100) + "%";

    var badge = $("#qTierBadge");
    badge.textContent = TIER_NAME[t];
    badge.dataset.tier = t;
    var wrap = $(".quiz-icon-wrap");
    wrap.dataset.tier = t;

    var icon = $("#qIcon");
    icon.hidden = false;
    $("#qIconFallback").hidden = true;
    icon.src = "icons/" + cur.i;

    $("#answerPanel").hidden = true;
    quiz.optsShown = false;
    $("#showOptionsBtn").hidden = false;
    $("#options").hidden = true;
    $("#options").innerHTML = "";
    var opts = makeOptions(cur);
    var keys = ["A", "B", "C", "D"];
    opts.forEach(function (item, k) {
      var btn = document.createElement("button");
      btn.className = "option";
      btn.innerHTML = '<span class="opt-key">' + keys[k] + '</span><span class="opt-text"></span>';
      $(".opt-text", btn).textContent = item.n;
      btn.addEventListener("click", function () { answer(item, btn); });
      $("#options").appendChild(btn);
    });
    // 重新触发图标入场动画
    wrap.style.animation = "none";
    void wrap.offsetWidth;
    wrap.style.animation = "";
  }

  function answer(item, btn) {
    if (quiz.locked) return;
    quiz.locked = true;
    var correct = quiz.cur;
    var isRight = item.i === correct.i;

    $all("#options .option").forEach(function (b) {
      b.disabled = true;
      var name = $(".opt-text", b).textContent;
      if (name === correct.n) b.classList.add("is-correct");
      else b.classList.add("is-dim");
    });
    if (!isRight) {
      btn.classList.remove("is-dim");
      btn.classList.add("is-wrong");
      quiz.streak = 0;
      quiz.wrong.push({ item: correct, picked: item.n });
    } else {
      quiz.score++;
      quiz.streak++;
      quiz.bestStreak = Math.max(quiz.bestStreak, quiz.streak);
    }
    $("#qScore").textContent = quiz.score;
    $("#qStreak").textContent = quiz.streak;

    var panel = $("#answerPanel");
    panel.hidden = false;
    var title = $("#answerTitle");
    title.className = "answer-title " + (isRight ? "ok" : "no");
    title.textContent = isRight
      ? "✓ 答对了" + (quiz.streak >= 3 ? "　" + quiz.streak + " 连击！" : "")
      : "✗ 正确答案：" + correct.n;
    $("#answerDesc").textContent = correct.d;
    var nextBtn = $("#nextBtn");
    nextBtn.textContent = quiz.idx === quiz.list.length - 1 ? "查看结果" : "下一题";

    if (isRight) {
      quiz._autoTimer = setTimeout(function () {
        quiz._autoTimer = null;
        nextBtn.click();
      }, 650);
    }
  }

  function finishQuiz() {
    $("#progressBar").style.width = "100%";
    var total = quiz.list.length;
    var score = quiz.score;
    var acc = Math.round(score / total * 100);

    $("#resultScore").textContent = score;
    $("#resultTotal").textContent = "/" + total;
    $(".score-ring").style.setProperty("--p", acc);

    var word = acc >= 95 ? "海克斯大师！实至名归" :
               acc >= 80 ? "炉火纯青，再冲满分" :
               acc >= 60 ? "中规中矩，继续刷图鉴" :
               acc >= 40 ? "初出茅庐，多看看图鉴" : "新手入门，先去图鉴学习吧";
    $("#resultSub").innerHTML = "正确率 <b>" + acc + "%</b>　·　最高连击 <b>" + quiz.bestStreak + "</b><br/>" + word;

    // 错题
    var wrongWrap = $("#wrongWrap");
    if (quiz.wrong.length) {
      wrongWrap.hidden = false;
      $("#wrongList").innerHTML = "";
      quiz.wrong.forEach(function (w) {
        var cell = document.createElement("div");
        cell.className = "wrong-item";
        cell.innerHTML =
          '<img src="icons/' + w.item.i + '" onerror="HexImgErr(this)">' +
          '<span class="icon-fallback" data-fb hidden>' + (w.item.n[0] || "?") + '</span>' +
          '<span><div class="wi-name"></div><div class="wi-pick">你选了：<span class="wp"></span></div></span>';
        $(".wi-name", cell).textContent = w.item.n;
        $(".wp", cell).textContent = w.picked;
        $("#wrongList").appendChild(cell);
      });
    } else {
      wrongWrap.hidden = true;
    }

    // 记录最佳（题量≥10）
    if (total >= 10) {
      var best = getBest();
      if (!best || acc > best.acc || (acc === best.acc && total > best.total)) {
        setBest({ acc: acc, correct: score, total: total });
      }
    }
    renderBest();
    showView("result");
  }

  $("#nextBtn").addEventListener("click", function () {
    if (quiz.idx < quiz.list.length - 1) { quiz.idx++; loadQuestion(); }
    else { finishQuiz(); }
  });
  $("#showOptionsBtn").addEventListener("click", function () {
    quiz.optsShown = true;
    this.hidden = true;
    var box = $("#options");
    box.hidden = false;
    box.classList.remove("opts-in");
    void box.offsetWidth;
    box.classList.add("opts-in");
  });
  $("#quitBtn").addEventListener("click", function () { showView("home"); });
  $("#againBtn").addEventListener("click", function () { startQuiz(); });
  $("#resultHomeBtn").addEventListener("click", function () { showView("home"); });

  function startQuiz() {
    var pool = buildPool();
    if (!pool.length) return;
    quiz.list = pool;
    quiz.idx = 0; quiz.score = 0; quiz.streak = 0; quiz.bestStreak = 0; quiz.wrong = [];
    showView("quiz");
    loadQuestion();
  }
  $("#startBtn").addEventListener("click", startQuiz);

  /* ---------- 图鉴 ---------- */
  var bookCfg = { tier: 0, kw: "" };
  $all("#bookTierChips .chip").forEach(function (c) {
    c.addEventListener("click", function () {
      $all("#bookTierChips .chip").forEach(function (x) { x.classList.remove("is-active"); });
      c.classList.add("is-active");
      bookCfg.tier = parseInt(c.dataset.tier, 10);
      renderBook();
    });
  });
  $("#searchInput").addEventListener("input", function (e) {
    bookCfg.kw = e.target.value.trim();
    renderBook();
  });
  $("#bookBackBtn").addEventListener("click", function () { showView("home"); });

  function renderBook() {
    var grid = $("#bookGrid");
    grid.innerHTML = "";
    var kw = bookCfg.kw.toLowerCase();
    var list = DATA.filter(function (x) {
      if (bookCfg.tier !== 0 && tierOf(x.i) !== bookCfg.tier) return false;
      if (kw && x.n.toLowerCase().indexOf(kw) === -1) return false;
      return true;
    });
    $("#bookEmpty").hidden = list.length > 0;

    var frag = document.createDocumentFragment();
    list.forEach(function (x) {
      var t = tierOf(x.i);
      var cell = document.createElement("button");
      cell.className = "book-cell";
      cell.dataset.tier = t;
      cell.title = "点击查看详情";
      cell.innerHTML =
        '<img class="bc-icon" loading="lazy" src="icons/' + x.i + '" onerror="HexImgErr(this)" alt="">' +
        '<span class="bc-fallback" data-fb hidden>' + (x.n[0] || "?") + '</span>';
      cell.addEventListener("click", function () { openHexModal(x); });
      frag.appendChild(cell);
    });
    grid.appendChild(frag);
  }

  /* ---------- 符文详情弹窗 ---------- */
  var hexModal = $("#hexModal");
  function openHexModal(x) {
    var t = tierOf(x.i);
    var icon = $("#mIcon");
    icon.hidden = false;
    var fb = $("#mIconFallback");
    fb.hidden = true;
    fb.textContent = x.n[0] || "?";
    icon.src = "icons/" + x.i;
    $("#mIconWrap").dataset.tier = t;
    $("#mName").textContent = x.n;
    var tierEl = $("#mTier");
    tierEl.textContent = TIER_NAME[t];
    tierEl.dataset.tier = t;
    $("#mDesc").textContent = x.d;
    var memo = $("#mMemo");
    if (x.m) { memo.hidden = false; memo.textContent = x.m; }
    else { memo.hidden = true; memo.textContent = ""; }
    hexModal.hidden = false;
  }
  function closeHexModal() { hexModal.hidden = true; }
  $("#hexModalClose").addEventListener("click", closeHexModal);
  hexModal.addEventListener("click", function (e) {
    if (e.target === hexModal) closeHexModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !hexModal.hidden) closeHexModal();
  });

  /* ---------- 键盘快捷键（A/B/C/D + 回车） ---------- */
  document.addEventListener("keydown", function (e) {
    if (!$("#view-quiz").hidden && !quiz.locked && quiz.optsShown) {
      var idx = ["a", "b", "c", "d"].indexOf(e.key.toLowerCase());
      if (idx >= 0) {
        var btns = $all("#options .option");
        if (btns[idx]) btns[idx].click();
      }
    } else if (!$("#view-quiz").hidden && !quiz.locked && !quiz.optsShown && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      $("#showOptionsBtn").click();
    } else if (!$("#view-quiz").hidden && quiz.locked && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      $("#nextBtn").click();
    }
  });

  renderBest();
})();

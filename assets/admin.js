/* ============================================================
   FRIENDS — dashboard
   ------------------------------------------------------------
   SECURITY MODEL
   GitHub Pages is a static host: anything shipped in this file is
   public. So NO credential is stored here. "حفظ دائم" uses a
   fine-grained GitHub token that the operator pastes at runtime;
   it is kept only in this browser (localStorage/sessionStorage)
   and sent only to api.github.com over HTTPS. Nothing secret ever
   enters the repository.

   The token should be scoped to this ONE repo (friendsmenu/
   friendsmenu.github.io) with Contents: Read and write, and
   nothing else. Whoever holds it can publish — treat it like a
   password and use "نسيان التوكن" on shared devices.
   ============================================================ */
(function () {
  'use strict';

  var OWNER = 'friendsmenu';
  var REPO = 'friendsmenu.github.io';
  var BRANCH = 'main';
  var PATH = 'data/menu.json';

  var DRAFT_KEY = 'fm.menu.draft.v1';
  var TOKEN_KEY = 'fm.gh.token.v1';

  var $ = function (s) { return document.querySelector(s); };
  var published = null;   // last known published doc (for revert / diffing)
  var doc = null;         // working copy
  var curSec = 0;
  var curCat = null;      // null = viewing categories of curSec; index = viewing items of that category
  var dirty = false;

  /* ---------- tiny helpers ---------- */
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function safeId(s) { return /^[a-z0-9_-]+$/i.test(String(s || '')) ? String(s) : ''; }

  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast on' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function setStatus(text, cls) {
    $('#statusText').textContent = text;
    $('#status').className = 'status' + (cls ? ' ' + cls : '');
  }

  function markDirty() {
    dirty = true;
    setStatus('تعديلات غير منشورة', 'dirty');
    saveDraft();
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(doc)); } catch (e) {}
    refreshPreview();
  }

  var previewTimer;
  function refreshPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var f = $('#preview');
      if (f && f.contentWindow) {
        try { f.contentWindow.postMessage('fm:refresh', location.origin); }
        catch (e) { f.src = f.src; }
      }
    }, 400);
  }

  /* ---------- validation ---------- */
  function validate(d) {
    var errs = [];
    if (!d || !Array.isArray(d.sections) || !d.sections.length) {
      return ['المنيو فاضي أو تالف.'];
    }
    var secIds = {}, catIds = {};
    d.sections.forEach(function (s, i) {
      var where = 'القسم ' + (i + 1) + ' (' + (s.title || s.id || '؟') + ')';
      if (!safeId(s.id)) errs.push(where + ': المعرّف لازم يكون حروف إنجليزي/أرقام/شرطة بس.');
      if (secIds[s.id]) errs.push(where + ': المعرّف "' + s.id + '" مكرر.');
      secIds[s.id] = 1;
      if (!String(s.title || '').trim()) errs.push(where + ': اسم القسم مطلوب.');
      if (!Array.isArray(s.cats) || !s.cats.length) errs.push(where + ': لازم فئة واحدة على الأقل.');
      (s.cats || []).forEach(function (c, j) {
        var w2 = where + ' · الفئة ' + (j + 1) + ' (' + (c.title || c.id || '؟') + ')';
        if (!safeId(c.id)) errs.push(w2 + ': معرّف الفئة لازم يكون حروف إنجليزي/أرقام/شرطة.');
        if (catIds[c.id]) errs.push(w2 + ': معرّف الفئة "' + c.id + '" مكرر في المنيو كله.');
        catIds[c.id] = 1;
        if (!String(c.title || '').trim()) errs.push(w2 + ': اسم الفئة مطلوب.');
        if (!Array.isArray(c.items) || !c.items.length) errs.push(w2 + ': لازم صنف واحد على الأقل.');
        (c.items || []).forEach(function (it, k) {
          var w3 = w2 + ' · الصنف ' + (k + 1);
          if (!String(it.n || '').trim()) errs.push(w3 + ': اسم الصنف مطلوب.');
          var hasPrice = Array.isArray(it.s) ? it.s.some(function (v) { return num(v) > 0; }) : num(it.p) > 0;
          if (!hasPrice) errs.push(w3 + ': لازم سعر واحد على الأقل أكبر من صفر.');
        });
      });
    });
    return errs;
  }

  /* ---------- normalise on the way in (mirrors index.html's normalize) ---------- */
  function normalize(d) {
    d = d || {};
    var b = d.brand || {};
    return {
      version: 1,
      updatedAt: d.updatedAt || new Date().toISOString(),
      brand: {
        nameAr: String(b.nameAr || ''), nameEn: String(b.nameEn || ''),
        tagline: String(b.tagline || ''), address: String(b.address || ''),
        facebook: String(b.facebook || ''),
        phones: Array.isArray(b.phones) ? b.phones.map(String) : [],
        currency: String(b.currency || 'ج')
      },
      sections: (d.sections || []).map(function (s) {
        return {
          id: safeId(s.id) || 'section',
          title: String(s.title || ''),
          emoji: String(s.emoji || '🍽️'),
          img: String(s.img || ''),
          desc: String(s.desc || ''),
          sized: !!s.sized,
          cats: (s.cats || []).map(function (c) {
            return {
              id: safeId(c.id) || 'cat',
              title: String(c.title || ''),
              isNew: !!c.isNew,
              items: (c.items || []).map(function (it) {
                var o = { n: String(it.n || '') };
                if (it.d) o.d = String(it.d);
                if (it.tag) o.tag = String(it.tag);
                if (Array.isArray(it.s)) o.s = it.s.map(function (v) { return v == null ? null : num(v); });
                else o.p = num(it.p);
                return o;
              })
            };
          })
        };
      })
    };
  }

  function priceLabel(it) {
    if (Array.isArray(it.s)) {
      return ['S', 'M', 'L'].map(function (l, i) {
        return l + ':' + (it.s[i] == null ? '—' : num(it.s[i]));
      }).join('  ');
    }
    return num(it.p) + ' ج';
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function renderSecs() {
    var box = $('#secList');
    box.textContent = '';
    doc.sections.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'row' + (i === curSec ? ' on' : '');
      row.draggable = true;
      row.dataset.i = i;

      var grip = document.createElement('span');
      grip.className = 'grip'; grip.textContent = '⋮⋮';

      var em = document.createElement('span');
      em.className = 'emoji'; em.textContent = s.emoji || '🍽️';

      var col = document.createElement('div');
      col.className = 'col';
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = s.title || '(بدون اسم)';
      var itemN = s.cats.reduce(function (a, c) { return a + c.items.length; }, 0);
      var sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = s.cats.length + ' فئة · ' + itemN + ' صنف';
      col.appendChild(nm); col.appendChild(sub);

      var edit = document.createElement('button');
      edit.className = 'btn xs ghost'; edit.type = 'button'; edit.textContent = 'تعديل';
      edit.addEventListener('click', function (e) { e.stopPropagation(); openSection(i); });

      row.appendChild(grip); row.appendChild(em); row.appendChild(col); row.appendChild(edit);
      row.addEventListener('click', function () { curSec = i; curCat = null; renderSecs(); renderMid(); });
      wireDrag(row, box, doc.sections, function () {
        curSec = 0; curCat = null; renderSecs(); renderMid(); markDirty();
      });
      box.appendChild(row);
    });
    $('#secCount').textContent = doc.sections.length;
  }

  function renderMid() {
    var box = $('#midList');
    box.textContent = '';
    var sec = doc.sections[curSec];
    if (!sec) {
      $('#midTitle').textContent = '—'; $('#midCount').textContent = 0;
      var e0 = document.createElement('div'); e0.className = 'empty'; e0.textContent = 'اختار قسم الأول.';
      box.appendChild(e0);
      return;
    }

    if (curCat === null) {
      $('#midTitle').textContent = sec.title || sec.id;
      $('#midCount').textContent = sec.cats.length;
      $('#midAdd').textContent = '+ فئة';
      $('#midAdd').onclick = function () {
        sec.cats.push({ id: 'cat' + (sec.cats.length + 1), title: 'فئة جديدة', isNew: false, items: [] });
        renderSecs(); renderMid(); markDirty();
        openCat(sec.cats.length - 1);
      };

      if (!sec.cats.length) {
        var e1 = document.createElement('div'); e1.className = 'empty';
        e1.textContent = 'مفيش فئات في القسم ده. اضغط «+ فئة» للإضافة.';
        box.appendChild(e1);
        return;
      }

      sec.cats.forEach(function (c, i) {
        var row = document.createElement('div');
        row.className = 'row'; row.draggable = true; row.dataset.i = i;

        var grip = document.createElement('span'); grip.className = 'grip'; grip.textContent = '⋮⋮';

        var col = document.createElement('div'); col.className = 'col';
        var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = c.title || '(بدون اسم)';
        var sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = c.items.length + ' صنف';
        col.appendChild(nm); col.appendChild(sub);

        row.appendChild(grip); row.appendChild(col);
        if (c.isNew) {
          var pill = document.createElement('span'); pill.className = 'pill new'; pill.textContent = 'NEW';
          row.appendChild(pill);
        }
        var edit = document.createElement('button');
        edit.className = 'btn xs ghost'; edit.type = 'button'; edit.textContent = 'تعديل';
        edit.addEventListener('click', function (e) { e.stopPropagation(); openCat(i); });
        row.appendChild(edit);

        row.addEventListener('click', function () { curCat = i; renderMid(); });
        wireDrag(row, box, sec.cats, function () { renderMid(); markDirty(); });
        box.appendChild(row);
      });
    } else {
      var cat = sec.cats[curCat];
      if (!cat) { curCat = null; renderMid(); return; }
      $('#midTitle').textContent = cat.title || cat.id;
      $('#midCount').textContent = cat.items.length;
      $('#midAdd').textContent = '+ صنف';
      $('#midAdd').onclick = function () {
        cat.items.push({ n: 'صنف جديد', p: 0 });
        renderMid(); renderSecs(); markDirty();
        openItem(cat.items.length - 1);
      };

      var back = document.createElement('div');
      back.className = 'back';
      back.textContent = '→ رجوع لفئات ' + (sec.title || sec.id);
      back.addEventListener('click', function () { curCat = null; renderMid(); });
      box.appendChild(back);

      if (!cat.items.length) {
        var e2 = document.createElement('div'); e2.className = 'empty';
        e2.textContent = 'مفيش أصناف في الفئة دي. اضغط «+ صنف» للإضافة.';
        box.appendChild(e2);
        return;
      }

      cat.items.forEach(function (it, i) {
        var row = document.createElement('div');
        row.className = 'row'; row.draggable = true; row.dataset.i = i;

        var grip = document.createElement('span'); grip.className = 'grip'; grip.textContent = '⋮⋮';

        var col = document.createElement('div'); col.className = 'col';
        var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = it.n || '(بدون اسم)';
        var sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = it.d || '';
        col.appendChild(nm); col.appendChild(sub);

        row.appendChild(grip); row.appendChild(col);
        if (it.tag) {
          var pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = it.tag;
          row.appendChild(pill);
        }
        var pr = document.createElement('span'); pr.className = 'price'; pr.textContent = priceLabel(it);
        row.appendChild(pr);

        row.addEventListener('click', function () { openItem(i); });
        wireDrag(row, box, cat.items, function () { renderMid(); markDirty(); });
        box.appendChild(row);
      });
    }
  }

  /* ---------- drag & drop reorder ---------- */
  function wireDrag(row, box, arr, done) {
    row.addEventListener('dragstart', function (e) {
      row.classList.add('drag');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.i);
    });
    row.addEventListener('dragend', function () {
      row.classList.remove('drag');
      Array.prototype.forEach.call(box.children, function (r) { r.classList.remove('over'); });
    });
    row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('over'); });
    row.addEventListener('dragleave', function () { row.classList.remove('over'); });
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      row.classList.remove('over');
      var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      var to = parseInt(row.dataset.i, 10);
      if (isNaN(from) || isNaN(to) || from === to) return;
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      done();
    });
  }

  /* ============================================================
     DRAWER EDITORS
     ============================================================ */
  function field(label, value, opts) {
    opts = opts || {};
    var wrap = document.createElement('label');
    wrap.className = 'fld';
    var s = document.createElement('span'); s.textContent = label;
    var input = document.createElement(opts.textarea ? 'textarea' : 'input');
    if (!opts.textarea) input.type = opts.type || 'text';
    if (opts.dir) input.dir = opts.dir;
    if (opts.step) input.step = opts.step;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.value = value == null ? '' : value;
    var err = document.createElement('div'); err.className = 'err'; err.textContent = opts.err || 'مطلوب';
    wrap.appendChild(s); wrap.appendChild(input); wrap.appendChild(err);
    wrap._input = input;
    return wrap;
  }
  function checkField(label, checked) {
    var wrap = document.createElement('label');
    wrap.className = 'chk';
    var inp = document.createElement('input');
    inp.type = 'checkbox'; inp.checked = !!checked;
    var s = document.createElement('span'); s.textContent = label;
    wrap.appendChild(inp); wrap.appendChild(s);
    wrap._input = inp;
    return wrap;
  }
  function selectField(label, value, options, labels) {
    var wrap = document.createElement('label');
    wrap.className = 'fld';
    var s = document.createElement('span'); s.textContent = label;
    var sel = document.createElement('select');
    options.forEach(function (o, i) {
      var op = document.createElement('option');
      op.value = o; op.textContent = (labels && labels[i]) || o;
      if (o === value) op.selected = true;
      sel.appendChild(op);
    });
    wrap.appendChild(s); wrap.appendChild(sel);
    wrap._input = sel;
    return wrap;
  }

  function openDrawer(title) {
    $('#drawerTitle').textContent = title;
    $('#drawer').classList.add('on');
    $('#drawerBack').classList.add('on');
  }
  function closeDrawer() {
    $('#drawer').classList.remove('on');
    $('#drawerBack').classList.remove('on');
  }

  function openSection(i) {
    var s = doc.sections[i];
    var body = $('#drawerBody');
    body.textContent = '';

    var fTitle = field('اسم القسم', s.title);
    var fId = field('المعرّف (يحدد اسم ملف الصورة)', s.id, { dir: 'ltr', err: 'حروف إنجليزي وأرقام وشرطة بس' });
    var fEmoji = field('إيموجي (بديل لو الصورة ناقصة)', s.emoji, { placeholder: '🍕' });
    var fImg = field('مسار الصورة', s.img, { dir: 'ltr', placeholder: 'assets/pizza.jpg' });
    var fDesc = field('وصف قصير', s.desc, { textarea: true });
    var fSized = checkField('فيه أصناف بمقاسات S / M / L (زي البيتزا)', s.sized);

    [fTitle, fId, fEmoji, fImg, fDesc].forEach(function (f) { body.appendChild(f); });
    body.appendChild(fSized);

    var note = document.createElement('div');
    note.className = 'hint';
    note.textContent = 'الصورة بتتقرا من المسار اللي فوق. لو الصورة مش موجودة هيظهر الإيموجي بدالها.';
    body.appendChild(note);

    $('#drawerSave').onclick = function () {
      var title = fTitle._input.value.trim();
      var id = safeId(fId._input.value.trim());
      fTitle.classList.toggle('bad', !title);
      fId.classList.toggle('bad', !id);
      var dup = doc.sections.some(function (o, j) { return j !== i && o.id === id; });
      if (dup) { fId.classList.add('bad'); toast('المعرّف ده مستخدم في قسم تاني', 'bad'); return; }
      if (!title || !id) { toast('صحّح الحقول المعلّمة بالأحمر', 'bad'); return; }
      s.title = title; s.id = id;
      s.emoji = fEmoji._input.value.trim() || '🍽️';
      s.img = fImg._input.value.trim();
      s.desc = fDesc._input.value.trim();
      s.sized = fSized._input.checked;
      closeDrawer(); renderSecs(); renderMid(); markDirty(); toast('اتحفظ محلياً');
    };
    $('#drawerDelete').onclick = function () {
      if (doc.sections.length <= 1) { toast('لازم يفضل قسم واحد على الأقل', 'bad'); return; }
      if (!confirm('حذف قسم «' + (s.title || s.id) + '» وكل فئاته وأصنافه؟')) return;
      doc.sections.splice(i, 1);
      curSec = 0; curCat = null;
      closeDrawer(); renderSecs(); renderMid(); markDirty(); toast('اتحذف');
    };
    openDrawer('تعديل قسم');
  }

  function openCat(i) {
    var sec = doc.sections[curSec];
    var c = sec.cats[i];
    var body = $('#drawerBody');
    body.textContent = '';

    var fTitle = field('اسم الفئة', c.title);
    var fId = field('المعرّف', c.id, { dir: 'ltr', err: 'حروف إنجليزي وأرقام وشرطة بس، وحيد في المنيو كله' });
    var fNew = checkField('شارة NEW على الفئة', c.isNew);

    [fTitle, fId].forEach(function (f) { body.appendChild(f); });
    body.appendChild(fNew);

    $('#drawerSave').onclick = function () {
      var title = fTitle._input.value.trim();
      var id = safeId(fId._input.value.trim());
      fTitle.classList.toggle('bad', !title);
      fId.classList.toggle('bad', !id);
      var dup = doc.sections.some(function (s2) {
        return s2.cats.some(function (o) { return o !== c && o.id === id; });
      });
      if (dup) { fId.classList.add('bad'); toast('المعرّف ده مستخدم في فئة تانية', 'bad'); return; }
      if (!title || !id) { toast('صحّح الحقول المعلّمة بالأحمر', 'bad'); return; }
      c.title = title; c.id = id; c.isNew = fNew._input.checked;
      closeDrawer(); renderSecs(); renderMid(); markDirty(); toast('اتحفظ محلياً');
    };
    $('#drawerDelete').onclick = function () {
      if (!confirm('حذف فئة «' + (c.title || c.id) + '» وكل أصنافها؟')) return;
      sec.cats.splice(i, 1);
      curCat = null;
      closeDrawer(); renderSecs(); renderMid(); markDirty(); toast('اتحذف');
    };
    openDrawer('تعديل فئة');
  }

  function openItem(i) {
    var sec = doc.sections[curSec];
    var cat = sec.cats[curCat];
    var it = cat.items[i];
    var isSized = Array.isArray(it.s);
    var body = $('#drawerBody');
    body.textContent = '';

    var fName = field('اسم الصنف', it.n);
    var fMode = selectField('نوع السعر', isSized ? 'sizes' : 'single', ['single', 'sizes'], ['سعر واحد', '3 أحجام (S / M / L)']);

    var priceBox = document.createElement('div');
    function renderPriceBox(mode) {
      priceBox.textContent = '';
      priceBox.className = 'sizeblock';
      if (mode === 'sizes') {
        var row = document.createElement('div'); row.className = 'row3';
        ['S', 'M', 'L'].forEach(function (lab, idx) {
          var v = isSized ? it.s[idx] : null;
          var f = field(lab, v == null ? '' : v, { type: 'number', step: '1', dir: 'ltr', placeholder: '—' });
          f._input.dataset.size = idx;
          row.appendChild(f);
        });
        priceBox.appendChild(row);
        var hint = document.createElement('div'); hint.className = 'hint';
        hint.textContent = 'سيب الخانة فاضية لو الحجم ده مش متاح للصنف ده.';
        priceBox.appendChild(hint);
      } else {
        var fp = field('السعر (' + (DBRAND().currency || 'ج') + ')', isSized ? '' : num(it.p), { type: 'number', step: '1', dir: 'ltr' });
        priceBox.appendChild(fp);
      }
    }
    function DBRAND() { return doc.brand || {}; }
    renderPriceBox(fMode._input.value);
    fMode._input.addEventListener('change', function () { renderPriceBox(this.value); });

    var fDesc = field('وصف / مكوّنات (اختياري)', it.d || '', { textarea: true });
    var fTag = field('شارة صغيرة (اختياري)', it.tag || '', { placeholder: 'مثال: حلو، جبن، صيامي' });

    body.appendChild(fName);
    body.appendChild(fMode);
    body.appendChild(priceBox);
    body.appendChild(fDesc);
    body.appendChild(fTag);

    $('#drawerSave').onclick = function () {
      var name = fName._input.value.trim();
      fName.classList.toggle('bad', !name);

      var mode = fMode._input.value;
      var priceOk = false, sizes = null, single = 0;
      if (mode === 'sizes') {
        sizes = [0, 1, 2].map(function (idx) {
          var inp = priceBox.querySelector('input[data-size="' + idx + '"]');
          var raw = inp.value.trim();
          return raw === '' ? null : num(raw);
        });
        priceOk = sizes.some(function (v) { return v != null && v > 0; });
      } else {
        var inp = priceBox.querySelector('input');
        single = num(inp.value);
        priceOk = single > 0;
      }
      var priceFld = mode === 'sizes' ? priceBox.querySelector('.row3') : priceBox.querySelector('.fld');
      if (priceFld) priceFld.classList && priceFld.classList.toggle('bad', !priceOk);

      if (!name || !priceOk) { toast('صحّح الحقول المعلّمة بالأحمر — لازم اسم وسعر أكبر من صفر', 'bad'); return; }

      it.n = name;
      if (mode === 'sizes') { it.s = sizes; delete it.p; }
      else { it.p = single; delete it.s; }
      var d = fDesc._input.value.trim(); if (d) it.d = d; else delete it.d;
      var tag = fTag._input.value.trim(); if (tag) it.tag = tag; else delete it.tag;

      closeDrawer(); renderMid(); renderSecs(); markDirty(); toast('اتحفظ محلياً');
    };
    $('#drawerDelete').onclick = function () {
      if (!confirm('حذف «' + (it.n || 'الصنف') + '»؟')) return;
      cat.items.splice(i, 1);
      closeDrawer(); renderMid(); renderSecs(); markDirty(); toast('اتحذف');
    };
    openDrawer('تعديل صنف');
  }

  /* ============================================================
     BRAND SETTINGS
     ============================================================ */
  function openSettings() {
    var b = doc.brand;
    var body = $('#setBody');
    body.textContent = '';

    var fAr = field('اسم المطعم (عربي)', b.nameAr);
    var fEn = field('اسم المطعم (إنجليزي)', b.nameEn, { dir: 'ltr' });
    var fTag = field('الشعار / الوصف تحت اللوجو', b.tagline);
    var fAddr = field('العنوان', b.address, { textarea: true });
    var fFb = field('لينك فيسبوك', b.facebook, { dir: 'ltr', placeholder: 'https://www.facebook.com/...' });
    var fCur = field('رمز العملة', b.currency, { placeholder: 'ج' });
    var fPhones = field('أرقام التليفونات (رقم في كل سطر)', b.phones.join('\n'), { textarea: true, dir: 'ltr' });

    [fAr, fEn, fTag, fAddr, fFb, fCur, fPhones].forEach(function (f) { body.appendChild(f); });

    $('#setSave').onclick = function () {
      var fb = fFb._input.value.trim();
      if (fb && !/^https?:\/\//i.test(fb)) { fFb.classList.add('bad'); toast('لينك فيسبوك لازم يبدأ بـ https://', 'bad'); return; }
      fFb.classList.remove('bad');
      b.nameAr = fAr._input.value.trim();
      b.nameEn = fEn._input.value.trim();
      b.tagline = fTag._input.value.trim();
      b.address = fAddr._input.value.trim();
      b.facebook = fb;
      b.currency = fCur._input.value.trim() || 'ج';
      b.phones = fPhones._input.value.split('\n').map(function (p) { return p.trim(); }).filter(Boolean);
      closeSettings(); markDirty(); toast('اتحفظ محلياً');
    };
    $('#setModal').classList.add('on');
    $('#setBack').classList.add('on');
  }
  function closeSettings() {
    $('#setModal').classList.remove('on');
    $('#setBack').classList.remove('on');
  }

  /* ============================================================
     GITHUB PUBLISH  (token supplied at runtime, never stored in repo)
     ============================================================ */
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''; }
    catch (e) { return ''; }
  }
  function setToken(t, remember) {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    } catch (e) {}
  }
  function forgetToken() {
    try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function gh(path, opts) {
    opts = opts || {};
    var headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Authorization': 'Bearer ' + getToken()
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com/' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
  }

  // UTF-8 safe base64 (GitHub wants base64 content)
  function b64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function unb64(s) {
    var bin = atob(String(s).replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function progress(steps) {
    var box = $('#progList');
    box.textContent = '';
    steps.forEach(function (s) {
      var d = document.createElement('div');
      d.textContent = '• ' + s;
      box.appendChild(d);
    });
    return {
      done: function (i, txt) {
        var d = box.children[i];
        if (d) { d.className = 'done'; d.textContent = '✓ ' + (txt || d.textContent.replace(/^[•✓✕]\s*/, '')); }
      },
      fail: function (i, txt) {
        var d = box.children[i];
        if (d) { d.className = 'fail'; d.textContent = '✕ ' + (txt || d.textContent.replace(/^[•✓✕]\s*/, '')); }
      },
      msg: function (text) {
        var m = document.createElement('span');
        m.className = 'msg';
        m.textContent = text;
        box.appendChild(m);
      }
    };
  }

  function openPublish() {
    var errs = validate(doc);
    if (errs.length) {
      alert('مش هينفع ننشر — فيه مشاكل:\n\n• ' + errs.slice(0, 8).join('\n• '));
      return;
    }
    var has = !!getToken();
    $('#pubSetup').classList.toggle('hidden', has);
    $('#pubProgress').classList.add('hidden');
    $('#pubForget').classList.toggle('hidden', !has);
    $('#pubGo').classList.remove('hidden');
    $('#pubGo').disabled = false;
    $('#pubGo').textContent = has ? 'نشر التعديلات' : 'حفظ التوكن وانشر';
    $('#tokenInput').value = '';
    $('#pubModal').classList.add('on');
    $('#pubBack').classList.add('on');
    if (!has) setTimeout(function () { $('#tokenInput').focus(); }, 120);
  }
  function closePublish() {
    $('#pubModal').classList.remove('on');
    $('#pubBack').classList.remove('on');
  }

  async function doPublish() {
    if (!getToken()) {
      var t = $('#tokenInput').value.trim();
      if (!t) { toast('الصق التوكن الأول', 'bad'); return; }
      setToken(t, $('#tokenRemember').checked);
      $('#tokenInput').value = '';
    }

    $('#pubSetup').classList.add('hidden');
    $('#pubProgress').classList.remove('hidden');
    $('#pubGo').disabled = true;
    $('#pubGo').textContent = 'جاري النشر…';

    var p = progress([
      'التحقق من التوكن',
      'قراءة النسخة الحالية',
      'رفع المنيو الجديد',
      'انتظار نشر الموقع'
    ]);

    try {
      // 1. token + repo access
      var who = await gh('repos/' + OWNER + '/' + REPO);
      if (who.status === 401) throw new Error('التوكن غير صالح أو منتهي. اعمل توكن جديد.');
      if (who.status === 403) throw new Error('التوكن مالوش صلاحية على المستودع ده.');
      if (who.status === 404) throw new Error('مش لاقي المستودع — اتأكد إن التوكن مختار له ' + REPO + '.');
      if (!who.ok) throw new Error('GitHub رد بكود ' + who.status);
      var repo = await who.json();
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error('التوكن للقراءة بس. لازم Contents = Read and write.');
      }
      p.done(0, 'التوكن سليم');

      // 2. current file sha (needed to update, and guards against clobbering)
      var cur = await gh('repos/' + OWNER + '/' + REPO + '/contents/' + PATH + '?ref=' + BRANCH);
      var sha = null, remoteText = null;
      if (cur.ok) {
        var meta = await cur.json();
        sha = meta.sha;
        try { remoteText = unb64(meta.content); } catch (e) {}
      } else if (cur.status !== 404) {
        throw new Error('تعذّر قراءة الملف الحالي (كود ' + cur.status + ')');
      }
      p.done(1, sha ? 'قرأت النسخة الحالية' : 'الملف جديد');

      // Warn if the published file changed since this page loaded
      if (remoteText && published && remoteText.trim() !== JSON.stringify(published, null, 2).trim()) {
        if (!confirm('المنيو المنشور اتغيّر من مكان تاني بعد ما فتحت اللوحة.\nلو كمّلت هتستبدله بنسختك. تكمّل؟')) {
          p.fail(2, 'اتلغى بواسطتك');
          $('#pubGo').disabled = false;
          $('#pubGo').textContent = 'نشر التعديلات';
          return;
        }
      }

      // 3. write
      doc.updatedAt = new Date().toISOString();
      var body = {
        message: 'تحديث المنيو من لوحة التحكم',
        content: b64(JSON.stringify(doc, null, 2) + '\n'),
        branch: BRANCH
      };
      if (sha) body.sha = sha;

      var put = await gh('repos/' + OWNER + '/' + REPO + '/contents/' + PATH, { method: 'PUT', body: body });
      if (put.status === 409) throw new Error('فيه تعديل تاني حصل في نفس اللحظة. حدّث الصفحة وجرّب تاني.');
      if (!put.ok) {
        var e = await put.json().catch(function () { return {}; });
        throw new Error(e.message || ('فشل الرفع (كود ' + put.status + ')'));
      }
      p.done(2, 'المنيو اترفع');

      published = clone(doc);
      dirty = false;
      setStatus('منشور ✓', 'ok');
      p.done(3, 'الموقع بيتحدث — التغيير يظهر خلال دقيقة تقريباً');
      p.msg('لو فتحت الموقع ومشوفتش التغيير فوراً، اعمل تحديث بـ Ctrl+Shift+R.');
      $('#pubGo').classList.add('hidden');
      $('#pubCancel').textContent = 'تمام';
      toast('اتنشر بنجاح ✓', 'good');

    } catch (err) {
      var idx = 0;
      var box = $('#progList');
      for (var i = 0; i < box.children.length; i++) {
        if (box.children[i].className !== 'done') { idx = i; break; }
      }
      p.fail(idx);
      p.msg(err && err.message ? err.message : String(err));
      $('#pubGo').disabled = false;
      $('#pubGo').textContent = 'إعادة المحاولة';
      // a bad token shouldn't stay cached
      if (/غير صالح|منتهي|صلاحية|القراءة بس/.test(err.message || '')) {
        forgetToken();
        $('#pubSetup').classList.remove('hidden');
      }
      toast('فشل النشر', 'bad');
    }
  }

  /* ============================================================
     IMPORT / EXPORT / REVERT
     ============================================================ */
  function exportJson() {
    var blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'friends-menu-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('اتصدّر');
  }

  function importJson(file) {
    var r = new FileReader();
    r.onload = function () {
      var d;
      try { d = JSON.parse(r.result); }
      catch (e) { toast('الملف مش JSON سليم', 'bad'); return; }
      var errs = validate(d);
      if (errs.length) { alert('الملف فيه مشاكل:\n\n• ' + errs.slice(0, 8).join('\n• ')); return; }
      doc = normalize(d);
      curSec = 0; curCat = null;
      renderSecs(); renderMid(); markDirty();
      toast('اتحمّل — لسه محتاج «حفظ دائم»');
    };
    r.readAsText(file);
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function markSVG() {
    return '<svg viewBox="0 0 100 92" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M6 14 C34 -4 74 0 95 22 L64 36 C54 27 42 26 33 32 L46 88 Z" fill="#F97316"/>' +
      '<path d="M50 30 L80 25 L60 50 Z" fill="#16120C"/></svg>';
  }

  async function boot() {
    $('#tbMark').innerHTML = markSVG();

    // published copy
    try {
      var r = await fetch('data/menu.json', { cache: 'no-cache' });
      if (r.ok) published = await r.json();
    } catch (e) {}

    // local draft wins if newer
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) {}

    if (draft && !validate(draft).length) {
      doc = normalize(draft);
      var same = published && JSON.stringify(normalize(published).sections) === JSON.stringify(doc.sections)
        && JSON.stringify(normalize(published).brand) === JSON.stringify(doc.brand);
      if (same) { dirty = false; setStatus('منشور ✓', 'ok'); }
      else { dirty = true; setStatus('تعديلات غير منشورة', 'dirty'); }
    } else if (published && !validate(published).length) {
      doc = normalize(published);
      setStatus('منشور ✓', 'ok');
    } else {
      doc = { version: 1, brand: { nameAr: 'مطعم فرندس', currency: 'ج', phones: [] }, sections: [] };
      setStatus('تعذّر تحميل المنيو', 'dirty');
      toast('مش لاقي data/menu.json', 'bad');
    }

    curSec = 0; curCat = null;
    renderSecs();
    renderMid();

    /* --- wiring --- */
    $('#addSec').addEventListener('click', function () {
      var n = doc.sections.length + 1;
      doc.sections.push({ id: 'section' + n, title: 'قسم جديد', emoji: '🍽️', img: '', desc: '', sized: false, cats: [] });
      curSec = doc.sections.length - 1; curCat = null;
      renderSecs(); renderMid(); markDirty();
      openSection(curSec);
    });

    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerBack').addEventListener('click', closeDrawer);

    $('#btnSettings').addEventListener('click', openSettings);
    $('#setCancel').addEventListener('click', closeSettings);
    $('#setBack').addEventListener('click', closeSettings);

    $('#btnExport').addEventListener('click', exportJson);
    $('#btnImport').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });

    $('#btnRevert').addEventListener('click', function () {
      if (!published) { toast('مفيش نسخة منشورة', 'bad'); return; }
      if (!confirm('استعادة النسخة المنشورة؟ كل التعديلات غير المنشورة هتتلغي.')) return;
      doc = normalize(published);
      curSec = 0; curCat = null; dirty = false;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      renderSecs(); renderMid(); refreshPreview();
      setStatus('منشور ✓', 'ok');
      toast('اترجعت للنسخة المنشورة');
    });

    $('#btnRefresh').addEventListener('click', function () {
      var f = $('#preview'); f.src = 'index.html?preview=1&t=' + Date.now();
    });

    $('#btnPublish').addEventListener('click', openPublish);
    $('#pubCancel').addEventListener('click', closePublish);
    $('#pubBack').addEventListener('click', closePublish);
    $('#pubGo').addEventListener('click', doPublish);
    $('#pubForget').addEventListener('click', function () {
      forgetToken();
      toast('اتنسي التوكن من الجهاز ده');
      closePublish();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeDrawer(); closePublish(); closeSettings(); }
    });
    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  boot();
})();

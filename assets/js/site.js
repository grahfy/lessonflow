(() => {
  const PAGE_ORDER = [
    'index.html',
    'lessons.html',
    'teacher.html',
    'vouchers.html',
    'contact.html',
    'terms.html'
  ];

  const body = document.body;
  const links = Array.from(document.querySelectorAll('a[data-nav]'));
  const currentFile = getCurrentFile();
  let leaving = false;

  links.forEach((link) => {
    const targetFile = toFileName(link.getAttribute('href') || '');
    if (targetFile === currentFile) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }

    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || isExternal(href)) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      navigate(href);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || isFormElement(event.target)) {
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      jump(1);
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      jump(-1);
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;

  window.addEventListener('touchstart', (event) => {
    const point = event.changedTouches[0];
    touchStartX = point.clientX;
    touchStartY = point.clientY;
  }, { passive: true });

  window.addEventListener('touchend', (event) => {
    const point = event.changedTouches[0];
    const dx = point.clientX - touchStartX;
    const dy = point.clientY - touchStartY;

    if (Math.abs(dx) < 58 || Math.abs(dy) > 44) {
      return;
    }

    if (dx < 0) {
      jump(1);
    } else {
      jump(-1);
    }
  }, { passive: true });

  const yearSlot = document.querySelector('[data-year]');
  if (yearSlot) {
    yearSlot.textContent = String(new Date().getFullYear());
  }

  const markReady = () => {
    requestAnimationFrame(() => {
      body.classList.add('is-ready');
      fitToViewport();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markReady, { once: true });
  } else {
    markReady();
  }

  window.addEventListener('resize', fitToViewport);

  function getCurrentFile() {
    const name = window.location.pathname.split('/').pop();
    if (!name || name.trim() === '') {
      return 'index.html';
    }
    return name;
  }

  function toFileName(path) {
    const clean = path.split('#')[0].split('?')[0];
    if (!clean || clean === '/') {
      return 'index.html';
    }
    const name = clean.split('/').pop();
    return name || 'index.html';
  }

  function isExternal(path) {
    return /^(https?:)?\/\//.test(path) || path.startsWith('mailto:') || path.startsWith('tel:');
  }

  function isFormElement(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.hasAttribute('contenteditable');
  }

  function jump(direction) {
    const index = PAGE_ORDER.indexOf(currentFile);
    if (index === -1) {
      return;
    }

    let next = index + direction;
    if (next < 0) {
      next = PAGE_ORDER.length - 1;
    }
    if (next >= PAGE_ORDER.length) {
      next = 0;
    }

    navigate(PAGE_ORDER[next]);
  }

  function navigate(href) {
    if (leaving) {
      return;
    }

    leaving = true;
    body.classList.add('is-leaving');
    window.setTimeout(() => {
      window.location.href = href;
    }, 330);
  }

  function fitToViewport() {
    const view = document.querySelector('.view');
    if (!view) {
      return;
    }

    body.classList.remove('is-tight');
    body.classList.remove('is-tight-plus');

    if (view.scrollHeight > view.clientHeight + 2) {
      body.classList.add('is-tight');
    }

    if (view.scrollHeight > view.clientHeight + 2) {
      body.classList.add('is-tight-plus');
    }
  }
})();

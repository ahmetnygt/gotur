(function () {
  const initHeaderToggle = () => {
    const headers = document.querySelectorAll('.gtr-header, .gtr-header-invert, .gtr-header-no-image');

    headers.forEach((header, index) => {
      const toggleButton = header.querySelector('.gtr-header__toggle');
      const navLinks = header.querySelector('.gtr-header__links');

      if (!toggleButton || !navLinks) {
        return;
      }

      let navId = navLinks.getAttribute('id');
      if (!navId) {
        navId = `gtrHeaderLinks-${index + 1}`;
        navLinks.id = navId;
      }

      toggleButton.setAttribute('aria-controls', navId);

      const closeMenu = () => {
        navLinks.classList.remove('is-open');
        toggleButton.setAttribute('aria-expanded', 'false');
      };

      toggleButton.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('is-open');
        toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      navLinks.querySelectorAll('a.gtr-link').forEach((link) => {
        link.addEventListener('click', () => {
          if (window.matchMedia('(max-width: 768px)').matches && navLinks.classList.contains('is-open')) {
            closeMenu();
          }
        });
      });

      const desktopQuery = window.matchMedia('(min-width: 769px)');
      const handleDesktopChange = (event) => {
        if (event.matches) {
          closeMenu();
        }
      };

      if (typeof desktopQuery.addEventListener === 'function') {
        desktopQuery.addEventListener('change', handleDesktopChange);
      } else if (typeof desktopQuery.addListener === 'function') {
        desktopQuery.addListener(handleDesktopChange);
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeaderToggle);
  } else {
    initHeaderToggle();
  }
})();

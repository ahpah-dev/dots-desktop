// Dots Desktop Landing Page Interactions
document.addEventListener('DOMContentLoaded', () => {
  // 1. Lightbox Modal for App Screenshot
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxBackdrop = document.getElementById('lightboxBackdrop');
  const lightboxClose = document.getElementById('lightboxClose');
  const expandBtn = document.getElementById('expandBtn');
  const mainScreenshot = document.getElementById('mainScreenshot');

  const openLightbox = () => {
    if (lightboxModal) {
      lightboxModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeLightbox = () => {
    if (lightboxModal) {
      lightboxModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  if (expandBtn) expandBtn.addEventListener('click', openLightbox);
  if (mainScreenshot) mainScreenshot.addEventListener('click', openLightbox);
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxModal && lightboxModal.classList.contains('active')) {
      closeLightbox();
    }
  });

  // 2. Quick Terminal Copy Button
  const copyCloneBtn = document.getElementById('copyCloneBtn');
  if (copyCloneBtn) {
    copyCloneBtn.addEventListener('click', async () => {
      const codeText = `git clone https://github.com/davidegeric-cloud/dots-desktop.git
cd dots-desktop
npm install
npm run dist`;

      try {
        await navigator.clipboard.writeText(codeText);
        const originalText = copyCloneBtn.innerText;
        copyCloneBtn.innerText = 'Copied!';
        copyCloneBtn.style.color = '#10b981';
        copyCloneBtn.style.borderColor = '#10b981';

        setTimeout(() => {
          copyCloneBtn.innerText = originalText;
          copyCloneBtn.style.color = '';
          copyCloneBtn.style.borderColor = '';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy code to clipboard', err);
      }
    });
  }

  // 3. Navbar scroll effect
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        navbar.style.background = 'rgba(9, 10, 15, 0.92)';
        navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4)';
      } else {
        navbar.style.background = 'rgba(9, 10, 15, 0.75)';
        navbar.style.boxShadow = 'none';
      }
    });
  }
});

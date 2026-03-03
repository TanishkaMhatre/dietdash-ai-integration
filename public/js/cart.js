// Delegated Add-to-Cart handler used across site
(async function(){
  function findBadge(){
    return document.querySelector('.cart-badge') || document.querySelector('.navbar .badge');
  }

  async function addToCart(foodId, quantity=1){
    try{
      const res = await fetch('/user/cart/add', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodId, quantity })
      });
      if (res.status === 401) {
        alert('Please login to add items to cart');
        return { success: false, message: 'Unauthorized' };
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        return { success: false, message: json.message || 'Server error' };
      }
      return await res.json();
    } catch(e){
      console.error('Add to cart network error', e);
      return { success: false, message: 'Network error' };
    }
  }

  document.addEventListener('click', async function(e){
    const btn = e.target.closest && e.target.closest('.add-to-cart-btn');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.id;
    if (!id) return;
    btn.disabled = true;
    btn.classList.add('loading');
    const result = await addToCart(id, 1);
    btn.disabled = false;
    btn.classList.remove('loading');
    if (result.success) {
      // If there is a cart page, redirect there for clarity
      if (window.location.pathname === '/user/cart') {
        // already on cart, reload to show new item
        window.location.reload();
        return;
      }
      // Update any visible badge
      const badge = findBadge();
      if (badge) {
        try {
          const current = parseInt(badge.textContent) || 0;
          badge.textContent = current + 1;
        } catch(e){ /* ignore */ }
      }
      // Small visual feedback
      btn.classList.add('btn-success');
      setTimeout(() => btn.classList.remove('btn-success'), 900);
    } else {
      alert(result.message || 'Could not add to cart');
    }
  });
})();

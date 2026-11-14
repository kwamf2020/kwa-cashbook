// Initialize Supabase Client

async function routeAfterLogin(userId) {
  const { data: row } = await supabaseClient.from('office_settings').select('office_id').eq('office_id', userId).maybeSingle();
  window.location.href = row ? 'index.html' : 'setup.html';
}

// Handle Login Form Submission
async function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('loginBtn');
  const errorDiv = document.getElementById('errorMessage');

  errorDiv.classList.add('hidden');
  loginBtn.innerText = 'Signing in...';
  loginBtn.disabled = true;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;

    // Login successful -> go to setup if this office has not been set up yet, otherwise the dashboard
    await routeAfterLogin(data.user.id);

  } catch (error) {
    errorDiv.innerText = error.message;
    errorDiv.classList.remove('hidden');
    loginBtn.innerText = 'Sign In to Office Dashboard';
    loginBtn.disabled = false;
  }
}

// Check if user is already logged in when opening the page
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await routeAfterLogin(session.user.id);
  }
}

// Run session check on page load
checkSession();

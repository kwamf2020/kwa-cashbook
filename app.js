// Initialize Supabase Client

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

    // Login successful -> Redirect to your main app page
    window.location.href = 'index.html';

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
    window.location.href = 'index.html';
  }
}

// Run session check on page load
checkSession();
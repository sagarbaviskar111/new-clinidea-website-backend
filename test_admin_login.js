async function test() {
  const credentials = [
    { email: 'admin@clinidea.in', password: 'PharmaTalentHub@2024' },
    { email: 'studentcoordinator@clinidea.in', password: 'PharmaTalentHub@2024' },
    { email: 'cr@clinidea.in', password: 'PharmaTalentHub@2024' },
    { email: 'pv@clinidea.in', password: 'PharmaTalentHub@2024' },
    { email: 'cdm@clinidea.in', password: 'PharmaTalentHub@2024' },
    { email: 'ra@clinidea.in', password: 'PharmaTalentHub@2024' },
    { email: 'mw@clinidea.in', password: 'PharmaTalentHub@2024' },
    { email: 'mc@clinidea.in', password: 'PharmaTalentHub@2024' }
  ];

  console.log('--- TESTING CREDENTIALS VIA LOGIN API ---');
  for (const cred of credentials) {
    try {
      const response = await fetch('http://localhost:5000/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cred.email, password: cred.password })
      });
      const data = await response.json();
      if (response.ok) {
        console.log(`✅ Success for ${cred.email} | Role: ${data.role}`);
      } else {
        console.log(`❌ Failed for ${cred.email}: ${data.error}`);
      }
    } catch (err) {
      console.log(`💥 Error testing ${cred.email}: ${err.message}`);
    }
  }
}

test();

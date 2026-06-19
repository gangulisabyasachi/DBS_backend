import crypto from 'node:crypto';

const BASE_URL = 'http://localhost:4000/api/v1';

async function runTest() {
  console.log('--- Starting End-to-End DB-based Auth Test ---');

  // 1. Login as Dev
  let res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dev', password: 'dev123' })
  });
  if (!res.ok) throw new Error('Dev login failed: ' + await res.text());
  const devData = await res.json();
  const devToken = devData.token;
  console.log('✅ Developer Login Successful');

  // 2. Create Admin User
  const adminUsername = `admin_${crypto.randomBytes(4).toString('hex')}`;
  res = await fetch(`${BASE_URL}/dev/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${devToken}` },
    body: JSON.stringify({ username: adminUsername, password: 'adminpassword', role: 'Admin' })
  });
  if (!res.ok) throw new Error('Admin creation failed: ' + await res.text());
  console.log(`✅ Admin Created: ${adminUsername}`);

  // 3. Login as Admin
  res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: 'adminpassword' })
  });
  if (!res.ok) throw new Error('Admin login failed: ' + await res.text());
  const adminData = await res.json();
  const adminToken = adminData.token;
  console.log('✅ Administrator Login Successful');

  // 4. Onboard Retailer
  const licenseNum = `LIC-${crypto.randomBytes(4).toString('hex')}`;
  res = await fetch(`${BASE_URL}/admin/retailers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ name: 'Test Liquor Store', address: '123 Fake St', licenseNumber: licenseNum })
  });
  if (!res.ok) throw new Error('Retailer onboard failed: ' + await res.text());
  const retailerData = await res.json();
  const retailerId = retailerData.retailerId;
  const apiKey = retailerData.apiKey;
  console.log(`✅ Retailer Onboarded: ${retailerId} (API Key: ${apiKey.substring(0, 8)}...)`);

  // 5. Dev Sets Retailer Password
  res = await fetch(`${BASE_URL}/dev/retailers/${retailerData._id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${devToken}` },
    body: JSON.stringify({ password: 'retailerpassword' })
  });
  if (!res.ok) throw new Error('Retailer password set failed: ' + await res.text());
  console.log('✅ Developer Set Retailer Password');

  // 6. Dev Creates Clerk
  const clerkId = `CLK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  res = await fetch(`${BASE_URL}/dev/clerks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${devToken}` },
    body: JSON.stringify({ clerkId, name: 'John Doe', retailerId, password: 'clerkpassword' })
  });
  if (!res.ok) throw new Error('Clerk creation failed: ' + await res.text());
  console.log(`✅ Clerk Created: ${clerkId}`);

  // 7. Retailer Login
  res = await fetch(`${BASE_URL}/auth/retailer-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, password: 'retailerpassword' })
  });
  if (!res.ok) throw new Error('Retailer login failed: ' + await res.text());
  const retAuthData = await res.json();
  console.log(`✅ Retailer Login Successful (Token received for ${retAuthData.user.retailerId})`);

  // 8. Clerk Login
  res = await fetch(`${BASE_URL}/auth/clerk-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, clerkId, password: 'clerkpassword' })
  });
  if (!res.ok) throw new Error('Clerk login failed: ' + await res.text());
  const clkAuthData = await res.json();
  console.log(`✅ Clerk Login Successful (Token received for Clerk ${clkAuthData.user.clerkId} at ${clkAuthData.user.retailerId})`);

  console.log('--- All Tests Passed Successfully! DB Authentication Confirmed ---');
}

runTest().catch(console.error);

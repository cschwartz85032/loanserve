export default function App() {
  return (
    <div style={{
      minHeight: '100vh', 
      backgroundColor: '#f3f4f6', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '32px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white', 
        borderRadius: '8px', 
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', 
        padding: '32px', 
        maxWidth: '400px', 
        width: '100%', 
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '28px', 
          fontWeight: 'bold', 
          color: '#1f2937', 
          marginBottom: '16px'
        }}>
          LoanServe Pro
        </h1>
        <p style={{color: '#6b7280', marginBottom: '24px', fontSize: '16px'}}>
          Enterprise Mortgage Loan Servicing Platform
        </p>
        <div style={{marginBottom: '24px'}}>
          <p style={{fontSize: '14px', color: '#059669', marginBottom: '8px'}}>
            ✅ System Online
          </p>
          <p style={{fontSize: '14px', color: '#2563eb', marginBottom: '8px'}}>
            🔧 Backend Services: Operational
          </p>
          <p style={{fontSize: '14px', color: '#7c3aed', marginBottom: '8px'}}>
            ⚡ Queue Processing: Active
          </p>
          <p style={{fontSize: '14px', color: '#dc2626', marginBottom: '8px'}}>
            🖥️ Frontend: Now Working
          </p>
        </div>
        <div style={{
          marginTop: '24px', 
          paddingTop: '16px', 
          borderTop: '1px solid #e5e7eb'
        }}>
          <a 
            href="/auth" 
            style={{
              display: 'inline-block', 
              backgroundColor: '#2563eb', 
              color: 'white', 
              padding: '12px 24px', 
              borderRadius: '6px', 
              textDecoration: 'none',
              fontSize: '16px',
              fontWeight: '500'
            }}
          >
            Access Login
          </a>
        </div>
      </div>
    </div>
  );
}
var y=document.getElementById('yr');if(y){y.textContent=new Date().getFullYear();}
function sq(e){
  e.preventDefault();
  var f=e.target,d=Object.fromEntries(new FormData(f).entries());
  var lines=[];for(var k in d){if(d[k])lines.push(k.charAt(0).toUpperCase()+k.slice(1)+': '+d[k]);}
  var url='mailto:hello@peakturnovercleaning.com?subject='+encodeURIComponent('New turnover quote request - '+(d.name||''))+'&body='+encodeURIComponent(lines.join(String.fromCharCode(10)));
  window.location.href=url;
  var b=f.querySelector('button[type=submit]');if(b){b.textContent='Opening your email...';}
  return false;
}

/* Adds the Shadows table to the existing in-game visual customizer. */
(function(){
 'use strict';
 function install(){
  var rail=document.querySelector('#visualCustomizer .table-rail[data-kind="table"]');
  if(!rail||rail.querySelector('[data-value="shadows"]'))return;
  var button=document.createElement('button');
  button.type='button';button.className='visual-choice large-choice';
  button.dataset.value='shadows';button.setAttribute('aria-label','سلول زندان · Double Kout in the Shadows');
  button.innerHTML='<span class="mini-table shadows"><i></i><b></b></span>';
  rail.insertBefore(button,rail.firstChild);
  if(window.visualChoice&&typeof window.setCardCustomization==='function'){
   try{
    var saved=JSON.parse(localStorage.getItem('doubleKoutCardStyle')||'{}');
    if(saved.table==='shadows'){window.visualChoice.table='shadows';window.setCardCustomization();}
   }catch(_){}
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
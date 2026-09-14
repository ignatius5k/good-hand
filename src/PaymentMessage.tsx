import {useRef,useState} from 'react';
import {CaretDown,Copy} from '@phosphor-icons/react';

export default function PaymentMessage({message,onCopied,onCopyStart}:{message:string;onCopied:()=>void;onCopyStart:()=>void}) {
  const preview=useRef<HTMLDetailsElement>(null);
  const field=useRef<HTMLTextAreaElement>(null);
  const [manualCopy,setManualCopy]=useState(false);
  async function copy(){
    onCopyStart();
    try{await navigator.clipboard.writeText(message);setManualCopy(false);onCopied();}
    catch{
      setManualCopy(true);
      if(preview.current)preview.current.open=true;
      requestAnimationFrame(()=>{field.current?.focus();field.current?.select();});
    }
  }
  return <div className="payment-message">
    <details ref={preview}>
      <summary>Payment message<CaretDown size={15}/></summary>
      <p>Only payments still owed are included.</p>
      <textarea ref={field} aria-label="Payment message to copy" readOnly value={message} rows={Math.min(10,Math.max(4,message.split('\n').length))} onFocus={e=>e.target.select()}/>
    </details>
    <button className="text-button message-copy" onClick={copy}><Copy size={16}/>Copy message</button>
    {manualCopy&&<p className="copy-help" role="status">Copy wasn’t available. The message is selected—press and hold to copy, or use Ctrl/Cmd+C.</p>}
  </div>;
}

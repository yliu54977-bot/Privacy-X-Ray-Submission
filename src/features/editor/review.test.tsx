import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecommendationReview } from './RecommendationReview';
import { ContextSelector } from './ContextSelector';
import type { DetectedField } from '../../types';
const fields:readonly DetectedField[]=[{id:'bank',imageId:'sample',type:'bank_account_number',label:'Bank account',value:'FICTIONAL',boxes:[],wordIds:[],confidence:.9}];
const callbacks={onSelectField:()=>{},onDecision:()=>{}};
describe('review UI states',()=>{
  it('shows unresolved review and linked deletion guidance',()=>{
    const html=renderToStaticMarkup(<RecommendationReview fields={fields} recommendations={[]} decisions={{bank:{fieldId:'bank',imageId:'sample',action:'REVIEW',reviewReason:'suggested_mask_removed'}}} removedMaskFieldIds={['bank']} status="complete" {...callbacks}/>);
    expect(html).toContain('need a KEEP or MASK choice before export');
    expect(html).toContain('Suggested mask removed. Choose whether to keep this information visible or mask it.');
    expect(html).toContain('Keep visible'); expect(html).toContain('Mask information');
  });
  it('leaves manual masking available in scan failure copy',()=>{
    const html=renderToStaticMarkup(<RecommendationReview fields={[]} recommendations={[]} decisions={{}} status="failed" {...callbacks}/>);
    expect(html).toContain('You can still redact manually.');
  });
  it('does not claim a clean scan is safe',()=>{
    const html=renderToStaticMarkup(<RecommendationReview fields={[]} recommendations={[]} decisions={{}} status="complete" {...callbacks}/>);
    expect(html).toContain('Inspect the entire screenshot');
  });
  it('offers only the three supported contexts',()=>{
    const html=renderToStaticMarkup(<ContextSelector value={{recipient:'university',purpose:'tuition_payment_verification'}} onChange={()=>{}}/>);
    expect(html).toContain('University / Tuition Payment Verification');
    expect(html).toContain('Customer Support / Order or Refund Inquiry');
    expect(html).toContain('Public Sharing / Sharing a Screenshot Publicly');
    expect(html.match(/<option /g)).toHaveLength(4);
  });
});

import { supabase } from './supabaseClient';

export const fetchAllInquiries = async () => {
  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .order('id', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const insertInquiry = async inquiryData => {
  const { data, error } = await supabase.from('inquiries').insert([inquiryData]).select();

  if (error) throw error;
  return data?.[0];
};

export const updateInquiryStatus = async (id, payload) => {
  const { error } = await supabase.from('inquiries').update(payload).eq('id', id);

  if (error) throw error;
};

export const updateInquiry = async (id, payload) => {
  const { data, error } = await supabase
    .from('inquiries')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const incrementFollowUpCount = async (id, currentCount) => {
  const newCount = (currentCount || 0) + 1;
  const { error } = await supabase
    .from('inquiries')
    .update({ follow_up_count: newCount })
    .eq('id', id);

  if (error) throw error;
  return newCount;
};

export const logMessage = async (number, text) => {
  const { error } = await supabase.from('messages').insert([{ number, text }]);

  if (error) throw error;
};

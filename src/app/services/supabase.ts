import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment.prod';

@Injectable({
  providedIn: 'root',
})
export class Supabase {
  private supabaseUrl = environment.supabaseUrl;
  private supabaseKey = environment.supabaseAnonKey;
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  // Insert main participant and return inserted row
  async insertMainParticipant(data: any) {
    const { data: inserted, error } = await this.supabase
      .from(environment.varanasiPrimaryTable)
      .insert([data])
      .select()
      .single();

    if (error) throw error;
    return inserted;
  }

  // Insert accompanying participants
  async insertAccompanyingParticipants(data: any[]) {
    if (data.length === 0) return true;
    const { error } = await this.supabase
      .from(environment.varanasiAccompanyingTable)
      .insert(data);

    if (error) throw error;
    return true;
  }

  // --- UPSERT ---
  async upsertParticipant(mainData: any, accompData: any[]) {
    // 1. Check if main participant exists by phone number
    const { data: existingParticipant, error: fetchError } = await this.supabase
      .from(environment.varanasiPrimaryTable)
      .select('*')
      .eq('mobile_number', mainData.mobile_number)
      .limit(1)

    if (fetchError) {
      throw fetchError;
    }

    let mainId: number;


    if (existingParticipant.length > 0) {

      mainId = existingParticipant[0].id;

      // 2a. Remove mobile_number from update data to avoid changing it
      const { mobile_number, ...updateData } = mainData;

      // 2b. Update existing participant except mobile_number
      const { data: updated, error: updateError } = await this.supabase
        .from(environment.varanasiPrimaryTable)
        .update(updateData)
        .eq('id', String(mainId))
        .select()

      if (updateError) throw updateError;

      // 3a. Delete old accompanying participants
      const { error: deleteError } = await this.supabase
        .from(environment.varanasiAccompanyingTable)
        .delete()
        .eq('main_participant_id', mainId);

      if (deleteError) throw deleteError;
    } else {
      // 2b. Insert new main participant
      const { data: inserted, error: insertError } = await this.supabase
        .from(environment.varanasiPrimaryTable)
        .insert([mainData])
        .select()
        .single();

      if (insertError) throw insertError;
      mainId = inserted.id;
    }

    // 4. Insert accompanying participants
    if (accompData.length > 0) {
      const accompToInsert = accompData.map(p => ({ ...p, main_participant_id: mainId }));
      const { error: accompError } = await this.supabase
        .from(environment.varanasiAccompanyingTable)
        .insert(accompToInsert);

      if (accompError) throw accompError;
    }

    return mainId;
  }
}

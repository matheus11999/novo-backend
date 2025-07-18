# MIKROPIX AutoRemover-v7 - Script de limpeza automática
# Remove IP bindings expirados baseado em timestamp Unix

:local currentTimestamp [:totime [/system clock get time]];
:local currentDate [/system clock get date];
:local currentUnixTime ([:totime ("$currentDate " . [:totime [/system clock get time]])] - [:totime "jan/01/1970 00:00:00"]);

:foreach binding in=[/ip hotspot ip-binding find] do={
    :local comment [/ip hotspot ip-binding get $binding comment];
    
    # Verificar se o comentário contém timestamp de expiração
    :if ([:find $comment "e:"] >= 0) do={
        :local expiryStart ([:find $comment "e:"] + 2);
        :local expiryEnd [:find $comment " " $expiryStart];
        :if ($expiryEnd < 0) do={ :set expiryEnd [:len $comment] };
        :local expiryStr [:pick $comment $expiryStart $expiryEnd];
        
        :do {
            # Converter string para número (timestamp Unix)
            :local expiryTimestamp [:tonum $expiryStr];
            
            # Comparar com timestamp atual
            :if ($currentUnixTime > $expiryTimestamp) do={
                :local address [/ip hotspot ip-binding get $binding address];
                :local mac [/ip hotspot ip-binding get $binding mac-address];
                /ip hotspot ip-binding remove $binding;
                :log info "[MIKROPIX-CLEANUP] IP binding expirado removido: $address ($mac) - Expirava em: $expiryStr";
            }
        } on-error={
            :log warning "[MIKROPIX-CLEANUP] Erro ao processar expiracao: $comment";
        }
    }
}
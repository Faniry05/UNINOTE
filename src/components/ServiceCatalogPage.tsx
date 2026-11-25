import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Power, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { catalogService } from '../api/catalog.service';
import type { ServiceItem } from '../types/scolarite';
import { formatAriary, formatDateShort } from '../utils/format';

export function ServiceCatalogPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Price editor modal
  const [editingPriceService, setEditingPriceService] = useState<ServiceItem | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  // Create new service modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPrice, setCreatePrice] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadServices() {
    setLoading(true);
    setError(null);
    try {
      const list = await catalogService.getServices(true);
      setServices(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement du catalogue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, []);

  async function handleSavePrice(e: FormEvent) {
    e.preventDefault();
    if (!editingPriceService) return;
    const parsed = Number(newPrice);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setError('Veuillez saisir un tarif entier positif en Ariary.');
      return;
    }
    setSavingPrice(true);
    setError(null);
    setFeedback(null);
    try {
      await catalogService.updateServicePrice(editingPriceService.id, parsed);
      setFeedback(
        `Tarif de « ${editingPriceService.name} » mis à jour à ${formatAriary(parsed)}. Les transactions passées conservent leur tarif historique.`
      );
      setEditingPriceService(null);
      await loadServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la mise à jour du tarif.');
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleToggleActive(service: ServiceItem) {
    setError(null);
    setFeedback(null);
    try {
      await catalogService.updateService(service.id, { isActive: !service.isActive });
      await loadServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de modifier le statut du service.');
    }
  }

  async function handleCreateService(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(createPrice);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setError('Veuillez saisir un tarif entier positif en Ariary.');
      return;
    }
    setCreating(true);
    setError(null);
    setFeedback(null);
    try {
      await catalogService.createService({
        name: createName.trim(),
        description: createDesc.trim(),
        price: parsed,
        isActive: true,
      });
      setShowCreateModal(false);
      setCreateName('');
      setCreateDesc('');
      setCreatePrice('');
      setFeedback('Nouvelle prestation ajoutée au catalogue Scolarité.');
      await loadServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la création du service.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-[9px]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-2">
        <div>
          <div data-enter="fade" className="scene-text font-mono-ref text-[12.6px]">UniNotes&nbsp;&nbsp;Scolarité / Tarifs /</div>
          <h1 data-enter="blur" className="scene-text scene-title mt-2">Tarifs</h1>
          <p data-enter="fade" className="scene-text text-[14px] mt-3 max-w-2xl">
            Configurez les tarifs en Ariary et l’état d’activation des services proposés au guichet.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreateModal(true);
            setError(null);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black self-start cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Ajouter un service
        </button>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-peach/70 border border-amber/40 px-4 py-3 text-xs text-ink">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Intégrité historique :</strong> Chaque transaction enregistre le prix appliqué au moment de sa
          création. Modifier un tarif ci-dessous n’altère jamais les ventes déjà enregistrées.
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div data-enter="rise" className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-ink/60">Chargement du catalogue...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink/10 bg-panel/60 text-xs font-medium text-ink/70">
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Tarif actuel</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Création</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 text-sm">
                {services.map((srv) => (
                  <tr key={srv.id} className="hover:bg-panel/60">
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-ink">{srv.name}</div>
                      <div className="text-xs font-mono-ref text-ink/60">{srv.code}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink/70 max-w-md">{srv.description}</td>
                    <td className="py-3.5 px-4 text-right font-medium text-ink tabular-nums whitespace-nowrap">
                      {formatAriary(srv.price)}
                    </td>
                    <td className="py-3.5 px-4">
                      {srv.isActive ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-panel px-2.5 py-1 text-xs font-medium text-ink/70 border border-ink/10">
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-ink/60 tabular-nums whitespace-nowrap">
                      {formatDateShort(srv.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPriceService(srv);
                            setNewPrice(String(srv.price));
                            setError(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink/80 hover:border-ink hover:text-ink cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Tarif
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(srv)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                            srv.isActive
                              ? 'border-ink/15 bg-white text-ink/80 hover:bg-panel/60'
                              : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {srv.isActive ? 'Désactiver' : 'Activer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Price Modal */}
      {editingPriceService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleSavePrice} className="w-full max-w-md rounded-2xl bg-white border border-ink/10 p-6 space-y-4">
            <h3 className="text-lg font-medium text-ink">Modifier le tarif — {editingPriceService.name}</h3>
            <p className="text-xs text-ink/70">
              Tarif actuel : <strong className="tabular-nums">{formatAriary(editingPriceService.price)}</strong>
            </p>
            <div>
              <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="edit-price-input">
                Nouveau tarif (en Ariary)
              </label>
              <input
                id="edit-price-input"
                type="number"
                min={0}
                step={100}
                required
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm font-medium tabular-nums text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingPriceService(null)}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium text-ink/80 hover:bg-panel/60 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingPrice}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 cursor-pointer"
              >
                {savingPrice ? 'Enregistrement...' : 'Enregistrer le tarif'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Service Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleCreateService} className="w-full max-w-md rounded-2xl bg-white border border-ink/10 p-6 space-y-4">
            <h3 className="text-lg font-medium text-ink">Nouvelle prestation Scolarité</h3>
            <div>
              <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="new-srv-name">
                Intitulé du service *
              </label>
              <input
                id="new-srv-name"
                type="text"
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Ex. Duplicata carte étudiant"
                className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="new-srv-desc">
                Description *
              </label>
              <textarea
                id="new-srv-desc"
                required
                rows={3}
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Description officielle de la prestation..."
                className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="new-srv-price">
                Tarif (Ariary) *
              </label>
              <input
                id="new-srv-price"
                type="number"
                min={0}
                step={100}
                required
                value={createPrice}
                onChange={(e) => setCreatePrice(e.target.value)}
                placeholder="Ex. 5000"
                className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm tabular-nums text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium text-ink/80 hover:bg-panel/60 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 cursor-pointer"
              >
                {creating ? 'Création...' : 'Créer le service'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
